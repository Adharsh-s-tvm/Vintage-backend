import Order from '../../models/product/orderModel.js';
import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { HttpStatus } from '../../utils/httpStatus.js';

export const getSalesReport = async (req, res) => {
    try {
        const { range, startDate, endDate } = req.query;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;
        let dateFilter = {};

        // Set date filter based on range
        switch (range) {
            case 'daily':
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                dateFilter = {
                    createdAt: {
                        $gte: today,
                        $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000)
                    }
                };
                break;
            case 'weekly':
                const weekStart = new Date();
                weekStart.setDate(weekStart.getDate() - weekStart.getDay());
                weekStart.setHours(0, 0, 0, 0);
                dateFilter = {
                    createdAt: {
                        $gte: weekStart,
                        $lt: new Date()
                    }
                };
                break;
            case 'monthly':
                const monthStart = new Date();
                monthStart.setDate(1);
                monthStart.setHours(0, 0, 0, 0);
                dateFilter = {
                    createdAt: {
                        $gte: monthStart,
                        $lt: new Date()
                    }
                };
                break;
            case 'yearly':
                const yearStart = new Date(new Date().getFullYear(), 0, 1);
                dateFilter = {
                    createdAt: {
                        $gte: yearStart,
                        $lt: new Date()
                    }
                };
                break;
            case 'custom':
                dateFilter = {
                    createdAt: {
                        $gte: new Date(startDate),
                        $lt: new Date(endDate)
                    }
                };
                break;
        }

        // Debug logs
        console.log('Query Parameters:', { range, startDate, endDate });
        console.log('Date Filter:', dateFilter);

        // First check if we have any orders at all
        const totalOrders = await Order.countDocuments({});
        console.log('Total orders in database:', totalOrders);

        // Check orders within date range
        const ordersInRange = await Order.countDocuments(dateFilter);
        console.log('Orders in date range:', ordersInRange);

        // Check completed payments
        const completedPayments = await Order.countDocuments({
            ...dateFilter,
            'payment.status': 'completed'
        });
        console.log('Completed payments in range:', completedPayments);

        // Get total count for transactions pagination
        const totalTransactions = await Order.countDocuments(dateFilter);

        // Get paginated transactions with proper skip and limit
        const transactions = await Order.find(dateFilter)
            .select('orderId totalAmount payment createdAt orderStatus items.status items.returnStatus')
            .sort('-createdAt')
            .skip(skip)
            .limit(limit);

        // Get stats for the filtered date range
        const stats = await Order.aggregate([
            { $match: dateFilter },
            {
                $group: {
                    _id: null,
                    totalRevenue: {
                        $sum: {
                            $cond: [
                                { $eq: ['$orderStatus', 'Delivered'] },
                                {
                                    $sum: {
                                        $map: {
                                            input: '$items',
                                            as: 'item',
                                            in: {
                                                $cond: [
                                                    {
                                                        $and: [
                                                            { $ne: ['$orderStatus', 'Cancelled'] },
                                                            { $ne: ['$$item.status', 'Returned'] }
                                                        ]
                                                    },
                                                    '$totalAmount',
                                                    0
                                                ]
                                            }
                                        }
                                    }
                                },
                                0
                            ]
                        }
                    },
                    totalOrders: { $sum: 1 },
                    returnedOrders: {
                        $sum: {
                            $cond: [
                                { $gt: [{ 
                                    $size: { 
                                        $filter: { 
                                            input: "$items",
                                            as: "item",
                                            cond: { $eq: ["$$item.status", "Returned"] }
                                        }
                                    }
                                }, 0] },
                                1,
                                0
                            ]
                        }
                    },
                    cancelledOrders: {
                        $sum: { $cond: [{ $eq: ['$orderStatus', 'Cancelled'] }, 1, 0] }
                    },
                    totalDiscounts: {
                        $sum: {
                            $cond: [
                                {
                                    $and: [
                                        { $ne: ['$orderStatus', 'Cancelled'] },
                                        {
                                            $not: {
                                                $gt: [{
                                                    $size: {
                                                        $filter: {
                                                            input: '$items',
                                                            as: 'item',
                                                            cond: { $eq: ['$$item.status', 'Returned'] }
                                                        }
                                                    }
                                                }, 0]
                                            }
                                        }
                                    ]
                                },
                                {
                                    $reduce: {
                                        input: "$items",
                                        initialValue: 0,
                                        in: {
                                            $add: [
                                                "$$value",
                                                {
                                                    $subtract: [
                                                        { $multiply: ["$$this.price", "$$this.quantity"] },
                                                        "$$this.finalPrice"
                                                    ]
                                                }
                                            ]
                                        }
                                    }
                                },
                                0
                            ]
                        }
                    }
                }
            }
        ]);

        console.log('Aggregation Results:', stats);

        // Get sales data for chart with proper date formatting and filtering
        const salesData = await Order.aggregate([
            { 
                $match: {
                    ...dateFilter,
                    orderStatus: 'Delivered'
                }
            },
            {
                $project: {
                    createdAt: 1,
                    items: {
                        $filter: {
                            input: '$items',
                            as: 'item',
                            cond: { $ne: ['$$item.status', 'Returned'] }
                        }
                    },
                    payment: 1
                }
            },
            {
                $group: {
                    _id: {
                        $dateToString: { 
                            format: '%Y-%m-%d', 
                            date: '$createdAt',
                            timezone: 'Asia/Kolkata'
                        }
                    },
                    sales: {
                        $sum: {
                            $reduce: {
                                input: '$items',
                                initialValue: 0,
                                in: { $add: ['$$value', '$$this.finalPrice'] }
                            }
                        }
                    },
                    orders: { $sum: 1 }
                }
            },
            { $sort: { '_id': 1 } }
        ]);
        
        // Add this inside getSalesReport function, in the aggregation pipeline
        const topProducts = await Order.aggregate([
            { $match: dateFilter },
            { $unwind: '$items' },
            {
                $group: {
                    _id: '$items.product',
                    totalSold: { $sum: '$items.quantity' },
                    revenue: { $sum: '$items.finalPrice' }
                }
            },
            {
                $lookup: {
                    from: 'products',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'productInfo'
                }
            },
            { $unwind: '$productInfo' },
            {
                $project: {
                    name: '$productInfo.name',
                    totalSold: 1,
                    revenue: 1
                }
            },
            { $sort: { revenue: -1 } },
            { $limit: 10 }
        ]);

        // Add this before the response object
        const topCategories = await Order.aggregate([
            { $match: dateFilter },
            { $unwind: '$items' },
            {
                $lookup: {
                    from: 'products',
                    localField: 'items.product',
                    foreignField: '_id',
                    as: 'productInfo'
                }
            },
            { $unwind: '$productInfo' },
            {
                $group: {
                    _id: '$productInfo.category',
                    revenue: { $sum: '$items.finalPrice' }
                }
            },
            {
                $lookup: {
                    from: 'categories',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'categoryInfo'
                }
            },
            { $unwind: '$categoryInfo' },
            {
                $project: {
                    name: '$categoryInfo.name',
                    revenue: 1
                }
            },
            { $sort: { revenue: -1 } },
            { $limit: 10 }
        ]);

        // Add this before the response object
        const topBrands = await Order.aggregate([
            { $match: dateFilter },
            { $unwind: '$items' },
            {
                $lookup: {
                    from: 'products',
                    localField: 'items.product',
                    foreignField: '_id',
                    as: 'productInfo'
                }
            },
            { $unwind: '$productInfo' },
            {
                $group: {
                    _id: '$productInfo.brand',
                    revenue: { $sum: '$items.finalPrice' }
                }
            },
            {
                $lookup: {
                    from: 'brands',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'brandInfo'
                }
            },
            { $unwind: '$brandInfo' },
            {
                $project: {
                    name: '$brandInfo.name',
                    revenue: 1
                }
            },
            { $sort: { revenue: -1 } },
            { $limit: 10 }
        ]);

        // Calculate total revenue for percentages
        const totalProductsRevenue = topProducts.reduce((sum, product) => sum + product.revenue, 0);
        const totalCategoriesRevenue = topCategories.reduce((sum, cat) => sum + cat.revenue, 0);
        const totalBrandsRevenue = topBrands.reduce((sum, brand) => sum + brand.revenue, 0);

        // Add this to your response object
        res.status(HttpStatus.OK).json({
            stats: stats[0] || {
                totalRevenue: 0,
                totalOrders: 0,
                returnedOrders: 0,
                cancelledOrders: 0,
                totalDiscounts: 0
            },
            salesData: salesData.map(item => ({
                date: item._id,
                sales: item.sales,
                orders: item.orders
            })),
            transactions: transactions.map(t => ({
                _id: t._id,
                orderId: t.orderId,
                amount: t.totalAmount,
                paymentMethod: t.payment.method,
                status: t.items.some(item => 
                    item.status === 'Returned' || 
                    item.returnStatus === 'Refunded' || 
                    item.returnStatus === 'Return Approved'
                ) ? 'Returned' : t.orderStatus,
                createdAt: t.createdAt
            })),
            pagination: {
                currentPage: page,
                totalPages: Math.ceil(totalTransactions / limit),
                totalItems: totalTransactions,
                itemsPerPage: limit,
                hasNextPage: skip + limit < totalTransactions,
                hasPrevPage: page > 1
            },
            topProducts: topProducts.map(product => ({
                name: product.name,
                value: Math.round((product.revenue / totalProductsRevenue) * 100),
                color: `#${Math.floor(Math.random()*16777215).toString(16)}` // Random color
            })),
            topCategories: topCategories.map(category => ({
                name: category.name,
                value: Math.round((category.revenue / totalCategoriesRevenue) * 100),
                color: `#${Math.floor(Math.random()*16777215).toString(16)}` // Random color
            })),
            topBrands: topBrands.map(brand => ({
                name: brand.name,
                value: Math.round((brand.revenue / totalBrandsRevenue) * 100),
                color: `#${Math.floor(Math.random()*16777215).toString(16)}` // Random color
            }))
        });

    } catch (error) {
        console.error('Error in getSalesReport:', error);
        res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ message: 'Failed to generate sales report' });
    }
};


export const downloadSalesReport = async (req, res) => {
    try {
        const { range, startDate, endDate } = req.query;
        let dateFilter = {};

        // Reuse the same date filter logic from getSalesReport
        switch (range) {
            case 'daily':
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                dateFilter = {
                    createdAt: {
                        $gte: today,
                        $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000)
                    }
                };
                break;
            case 'weekly':
                const weekStart = new Date();
                weekStart.setDate(weekStart.getDate() - weekStart.getDay());
                weekStart.setHours(0, 0, 0, 0);
                dateFilter = {
                    createdAt: {
                        $gte: weekStart,
                        $lt: new Date()
                    }
                };
                break;
            case 'monthly':
                const monthStart = new Date();
                monthStart.setDate(1);
                monthStart.setHours(0, 0, 0, 0);
                dateFilter = {
                    createdAt: {
                        $gte: monthStart,
                        $lt: new Date()
                    }
                };
                break;
            case 'yearly':
                const yearStart = new Date(new Date().getFullYear(), 0, 1);
                dateFilter = {
                    createdAt: {
                        $gte: yearStart,
                        $lt: new Date()
                    }
                };
                break;
            case 'custom':
                dateFilter = {
                    createdAt: {
                        $gte: new Date(startDate),
                        $lt: new Date(endDate)
                    }
                };
                break;
        }

        const doc = new PDFDocument({
            size: 'A4',
            margin: 40
        });
        
        const filename = `sales-report-${new Date().toISOString().split('T')[0]}.pdf`;
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
        doc.pipe(res);

        // Page 1: Header and Summary
        doc.font('Helvetica-Bold')
           .fontSize(20)
           .text('Sales Report', { align: 'center' });

        // Compact metadata line
        doc.moveDown(0.5)
           .fontSize(10)
           .font('Helvetica')
           .text(`Period: ${range.charAt(0).toUpperCase() + range.slice(1)} | Generated: ${new Date().toLocaleString('en-IN', { 
                dateStyle: 'medium', 
                timeStyle: 'short',
                timeZone: 'Asia/Kolkata'
            })}`, 
            { align: 'center' }
           );

        // Stats Grid - 2 columns for better space usage
        doc.moveDown();
        const stats = await Order.aggregate([
            { $match: dateFilter },
            {
                $group: {
                    _id: null,
                    totalRevenue: {
                        $sum: {
                            $cond: [
                                { $eq: ['$orderStatus', 'Delivered'] },
                                {
                                    $reduce: {
                                        input: '$items',
                                        initialValue: 0,
                                        in: {
                                            $add: [
                                                "$$value",
                                                {
                                                    $cond: [
                                                        { $ne: ['$$this.status', 'Returned'] },
                                                        "$$this.finalPrice",
                                                        0
                                                    ]
                                                }
                                            ]
                                        }
                                    }
                                },
                                0
                            ]
                        }
                    },
                    totalOrders: { $sum: 1 },
                    returnedOrders: {
                        $sum: {
                            $cond: [
                                { $gt: [{ 
                                    $size: { 
                                        $filter: { 
                                            input: "$items",
                                            as: "item",
                                            cond: { $eq: ["$$item.status", "Returned"] }
                                        }
                                    }
                                }, 0] },
                                1,
                                0
                            ]
                        }
                    },
                    cancelledOrders: {
                        $sum: { $cond: [{ $eq: ['$orderStatus', 'Cancelled'] }, 1, 0] }
                    },
                    totalDiscounts: {
                        $sum: {
                            $reduce: {
                                input: "$items",
                                initialValue: 0,
                                in: {
                                    $add: [
                                        "$$value",
                                        {
                                            $subtract: [
                                                { $multiply: ["$$this.price", "$$this.quantity"] },
                                                "$$this.finalPrice"
                                            ]
                                        }
                                    ]
                                }
                            }
                        }
                    }
                }
            }
        ]);
        const reportStats = stats[0] || {
            totalRevenue: 0,
            totalOrders: 0,
            returnedOrders: 0,
            cancelledOrders: 0,
            totalDiscounts: 0
        };

        const statsTable = {
            headers: ['Metric', 'Value'],
            rows: [
                ['Total Revenue', `₹${reportStats.totalRevenue.toLocaleString('en-IN')}`],
                ['Total Orders', reportStats.totalOrders],
                ['Returned Orders', reportStats.returnedOrders],
                ['Cancelled Orders', reportStats.cancelledOrders],
                ['Total Discounts', `₹${reportStats.totalDiscounts.toLocaleString('en-IN')}`]
            ]
        };

        createTable(doc, statsTable, {
            startX: 40,
            startY: doc.y + 10,
            rowHeight: 25,
            columnSpacing: 8,
            headerColor: '#4E80EE',
            alternateRowColor: '#F8F9FA',
            width: doc.page.width - 80
        });

        // Recent Transactions with optimized space
        doc.moveDown()
           .font('Helvetica-Bold')
           .fontSize(12)
           .text('Recent Transactions', { underline: true });

        const transactions = await Order.find(dateFilter)
            .select('orderId totalAmount payment createdAt orderStatus')
            .sort('-createdAt')
            .limit(15); // Reduced from previous limit

        const transactionsTable = {
            headers: ['Date', 'Order ID', 'Amount', 'Method', 'Status'], // Shortened headers
            rows: transactions.map(t => [
                new Date(t.createdAt).toLocaleDateString('en-IN', { 
                    day: '2-digit',
                    month: '2-digit',
                    year: '2-digit'
                }),
                t.orderId,
                `₹${t.totalAmount.toLocaleString('en-IN')}`,
                t.payment.method,
                t.orderStatus
            ])
        };

        createTable(doc, transactionsTable, {
            startX: 40,
            startY: doc.y + 10,
            rowHeight: 20, // Reduced row height
            columnSpacing: 5, // Reduced spacing
            headerColor: '#4E80EE',
            alternateRowColor: '#F8F9FA',
            width: doc.page.width - 80,
            fontSize: 9 // Smaller font size
        });

        // Add footer
        doc.fontSize(8)
           .text(
                'Generated by Vintage Jacket Store',
                40,
                doc.page.height - 40,
                { align: 'center', width: doc.page.width - 80 }
            );

        doc.end();

    } catch (error) {
        console.error('Error generating PDF:', error);
        res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ message: 'Failed to generate PDF report' });
    }
};

// Optimized helper function for creating tables
function createTable(doc, table, options) {
    const {
        startX,
        startY,
        rowHeight = 20,
        columnSpacing = 5,
        headerColor = '#4E80EE',
        alternateRowColor = '#F8F9FA',
        width = doc.page.width - 80,
        fontSize = 9
    } = options;

    const columnWidth = width / table.headers.length;
    let currentY = startY;

    // Draw headers
    doc.font('Helvetica-Bold')
       .fontSize(fontSize);

    // Header background
    doc.fillColor(headerColor)
       .rect(startX, currentY, width, rowHeight)
       .fill();

    // Header text
    doc.fillColor('white');
    table.headers.forEach((header, i) => {
        doc.text(
            header,
            startX + (i * columnWidth) + columnSpacing,
            currentY + (rowHeight / 3),
            { 
                width: columnWidth - (columnSpacing * 2),
                align: i === 0 ? 'left' : 'right'
            }
        );
    });

    // Draw rows
    currentY += rowHeight;
    doc.font('Helvetica')
       .fontSize(fontSize);

    table.rows.forEach((row, rowIndex) => {
        // Alternate row background
        if (rowIndex % 2 === 0) {
            doc.fillColor(alternateRowColor)
               .rect(startX, currentY, width, rowHeight)
               .fill();
        }

        // Row text
        doc.fillColor('black');
        row.forEach((cell, i) => {
            doc.text(
                cell.toString(),
                startX + (i * columnWidth) + columnSpacing,
                currentY + (rowHeight / 3),
                { 
                    width: columnWidth - (columnSpacing * 2),
                    align: i === 0 ? 'left' : 'right'
                }
            );
        });

        currentY += rowHeight;
    });

    doc.y = currentY + 10;
}