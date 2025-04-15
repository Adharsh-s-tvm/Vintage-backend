import asyncHandler from '../../middlewares/asyncHandler.js';
import Order from '../../models/product/orderModel.js';
import Cart from '../../models/product/cartModel.js';
import Address from '../../models/userAddressModel.js';
import Variant from '../../models/product/sizeVariantModel.js';
import mongoose from 'mongoose';
import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Coupon from '../../models/product/couponModel.js';
import { processReturnRefund } from './userWalletController.js';
import Wallet from '../../models/walletModel.js';
import { HttpStatus } from '../../utils/httpStatus.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const generateOrderId = () => {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `ORD-${year}${month}${day}-${random}`;
};

export const createOrder = asyncHandler(async (req, res) => {
    const session = await mongoose.startSession();
    let transactionStarted = false;

    try {
        await session.startTransaction();
        transactionStarted = true;

        const { addressId, paymentMethod, couponCode, amount } = req.body;
        const userId = req.user._id;
        const orderId = generateOrderId();

        // Add COD validation
        if (paymentMethod === 'cod' && amount > 1000) {
            throw new Error('Cash on Delivery is not available for orders above ₹1000');
        }

        // Handle wallet payment
        if (paymentMethod === 'wallet') {
            const wallet = await Wallet.findOne({ userId }).session(session);
            
            if (!wallet || wallet.balance < amount) {
                throw new Error('Insufficient wallet balance');
            }

            // Deduct amount from wallet
            wallet.balance -= amount;
            wallet.transactions.push({
                userId,
                type: 'debit',
                amount,
                description: `Payment for order #${orderId}`,
                date: new Date()
            });
            await wallet.save({ session });
        }

        // 1. Get user's cart
        const cart = await Cart.findOne({ user: userId })
            .populate({
                path: 'items.variant',
                populate: {
                    path: 'product',
                    populate: ['brand', 'category']
                }
            })
            .session(session);

        if (!cart || cart.items.length === 0) {
            throw new Error('Cart is empty');
        }

        // 2. Verify address
        const address = await Address.findById(addressId);
        if (!address) {
            res.status(HttpStatus.NOT_FOUNDyy);
            throw new Error('Delivery address not found');
        }

        // 3. Create order items and verify stock
        const orderItems = [];
        let subtotal = 0;

        for (const item of cart.items) {
            const variant = await Variant.findById(item.variant._id);
            
            // Check product availability
            if (!variant || variant.isBlocked || variant.product.isBlocked) {
                res.status(HttpStatus.BAD_REQUEST);
                throw new Error(`${item.variant.product.name} is no longer available`);
            }

            // Check stock
            if (variant.stock < item.quantity) {
                res.status(HttpStatus.BAD_REQUEST);
                throw new Error(`Insufficient stock for ${item.variant.product.name}`);
            }

            const itemPrice = variant.discountPrice || variant.price;
            const itemTotal = item.quantity * itemPrice;
            subtotal += itemTotal;

            orderItems.push({
                product: item.variant.product._id,
                sizeVariant: item.variant._id,
                quantity: item.quantity,
                price: variant.price, // Original price
                discountPrice: variant.discountPrice || variant.price, // Store discount price
                finalPrice: itemTotal,
                status: 'pending'
            });
        }

        // 4. Calculate totals
        const shippingCost = subtotal > 500 ? 0 : 50;
        const total = subtotal + shippingCost;

        let couponDiscount = 0;
        let appliedCoupon = null;

        // If coupon is provided, validate and calculate discount
        if (couponCode) {
            appliedCoupon = await Coupon.findOne({
                couponCode,
                startDate: { $lte: new Date() },
                endDate: { $gte: new Date() },
                isExpired: false,
                usedBy: { $nin: [userId] }
            });

            if (appliedCoupon) {
                // Calculate coupon discount
                if (appliedCoupon.discountType === 'percentage') {
                    couponDiscount = (subtotal * appliedCoupon.discountValue) / 100;
                } else {
                    couponDiscount = appliedCoupon.discountValue;
                }
            }
        }

        // Calculate final amounts
        const finalSubtotal = subtotal - couponDiscount;
        const finalTotal = finalSubtotal + shippingCost;

        // Create order items with discount information
        const orderItemsWithDiscount = orderItems.map(item => ({
            product: item.product,
            sizeVariant: item.sizeVariant,
            quantity: item.quantity,
            price: item.price,
            discountPrice: item.discountPrice,
            finalPrice: item.finalPrice,
            status: 'pending'
        }));

        // Set payment status based on payment method
        const paymentStatus = {
            cod: 'pending',
            wallet: 'completed',
            online: 'pending'
        }[paymentMethod];

        // Create order with appropriate payment status
        const order = new Order({
            user: userId,
            cart: cart._id,
            items: orderItemsWithDiscount,
            shipping: {
                address: {
                    fullName: address.fullName,
                    phone: address.phone,
                    street: address.street,
                    city: address.city,
                    state: address.state,
                    country: address.country || 'India',
                    postalCode: address.postalCode
                },
                shippingMethod: "Standard",
                deliveryCharge: shippingCost
            },
            payment: {
                method: paymentMethod,
                status: paymentStatus,
                transactionId: `TXN${Date.now()}${Math.floor(Math.random() * 10000)}`,
                amount: finalTotal
            },
            shippingAddress: addressId,
            paymentMethod,
            subtotal: finalSubtotal,
            shippingCost,
            total: finalTotal,
            totalAmount: finalTotal,
            orderId: orderId,
            couponCode: appliedCoupon ? couponCode : null,
            discountAmount: couponDiscount,
            totalDiscount: orderItemsWithDiscount.reduce((acc, item) => {
                const itemOriginalTotal = item.price * item.quantity;
                const itemFinalTotal = item.finalPrice * item.quantity;
                return acc + (itemOriginalTotal - itemFinalTotal);
            }, 0) + couponDiscount
        });

        // Save the order first
        await order.save({ session });

        // Update stock for each item after order is saved
        for (const item of orderItemsWithDiscount) {
            await Variant.findByIdAndUpdate(
                item.sizeVariant,
                { $inc: { stock: -item.quantity } },
                { new: true, session }
            );
        }

        // Clear cart
        cart.items = [];
        await cart.save({ session });

        // If coupon was applied successfully, add user to usedBy array
        if (appliedCoupon) {
            await Coupon.findByIdAndUpdate(appliedCoupon._id, {
                $push: { usedBy: userId }
            }, { session });
        }

        await order.save({ session });
        
        await session.commitTransaction();
        transactionStarted = false;

        res.status(HttpStatus.CREATED).json({
            success: true,
            message: 'Order placed successfully',
            orderId: order.orderId,
            totalAmount: order.totalAmount,
            totalDiscount: order.totalDiscount
        });
    } catch (error) {
        if (transactionStarted) {
            await session.abortTransaction();
        }
        res.status(HttpStatus.BAD_REQUEST).json({ message: error.message });
    } finally {
        session.endSession();
    }
});

// Get user orders with pagination and search
export const getOrders = asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || '';
    const userId = req.user._id;

    try {
        // Build search query
        const searchQuery = {
            user: userId,
            $or: [
                { orderId: { $regex: search, $options: 'i' } },
                { orderStatus: { $regex: search, $options: 'i' } },
                { 'shipping.address.fullName': { $regex: search, $options: 'i' } },
                { 'payment.amount': search ? Number(search) || -1 : -1 }
            ]
        };

        const orders = await Order.find(searchQuery)
            .populate({
                path: 'items.product',
                select: 'name images brand category',
                populate: [
                    { path: 'brand', select: 'name' },
                    { path: 'category', select: 'name' }
                ]
            })
            .populate({
                path: 'items.sizeVariant',
                select: 'size color price stock mainImage subImages',
            })
            .populate({
                path: 'shipping.address',
                select: 'fullName phone street city state country postalCode'
            })
            .populate('user', 'firstname lastname email phone')
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit);

        const total = await Order.countDocuments(searchQuery);

        res.json({
            success: true,
            orders,
            pagination: {
                currentPage: page,
                totalPages: Math.ceil(total / limit),
                totalOrders: total,
                hasNextPage: page < Math.ceil(total / limit),
                hasPrevPage: page > 1
            }
        });
    } catch (error) {
        res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ 
            success: false,
            message: "Failed to fetch orders",
            error: error.message 
        });
    }
});

// Get single order
export const getOrderById = asyncHandler(async (req, res) => {
    const order = await Order.findOne({
        orderId: req.params.id,
        user: req.user._id
    })
    .populate({
        path: 'items.product',
        select: 'name images'
    })
    .populate({
        path: 'items.sizeVariant',
        select: 'size color price mainImage subImages'
    })
    .populate({
        path: 'shipping.address',
        select: 'fullName street city state postalCode phone'
    });

    if (order) {
        res.json({
            success: true,
            order
        });
    } else {
        res.status(HttpStatus.NOT_FOUNDyy).json({
            success: false,
            message: 'Order not found'
        });
    }
});

// Cancel order
export const cancelOrder = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    await session.startTransaction();
    const { id } = req.params;
    const { reason } = req.body;
    const userId = req.user._id;

    const order = await Order.findOne({ 
      orderId: id,
      user: userId 
    }).populate('items.sizeVariant');

    if (!order) {
      return res.status(HttpStatus.NOT_FOUNDyy).json({ message: 'Order not found' });
    }

    // Check if order can be cancelled
    const allowedStatuses = ['pending', 'Processing'];
    if (!allowedStatuses.includes(order.orderStatus)) {
      return res.status(HttpStatus.BAD_REQUEST).json({ 
        message: 'Order cannot be cancelled at this stage' 
      });
    }

    // Find or create wallet for refund if payment method was online
    if (order.payment.method === 'online' || order.payment.method === 'wallet' && order.payment.status === 'completed') {
      let wallet = await Wallet.findOne({ userId }).session(session);
      
      if (!wallet) {
        wallet = await Wallet.create([{
          userId,
          balance: 0,
          transactions: []
        }], { session });
        wallet = wallet[0];
      }

      // Add refund to wallet
      wallet.balance += order.payment.amount;
      wallet.transactions.push({
        userId,
        type: 'credit',
        amount: order.payment.amount,
        description: `Refund for cancelled order #${order.orderId}`,
        date: new Date()
      });

      await wallet.save({ session });
    }

    // Update order status and reason
    order.orderStatus = 'Cancelled';
    order.reason = reason;
    
    // Update all items status to cancelled and restore stock
    order.items = order.items.map(item => ({
      ...item,
      status: 'Cancelled',
      cancellationReason: reason
    }));

    // Restore stock for each variant
    for (const item of order.items) {
      await Variant.findByIdAndUpdate(
        item.sizeVariant._id,
        { $inc: { stock: item.quantity } },
        { session }
      );
    }

    await order.save({ session });
    await session.commitTransaction();

    res.json({ 
      message: 'Order cancelled successfully',
      order 
    });

  } catch (error) {
    await session.abortTransaction();
    console.error('Cancel order error:', error);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ 
      message: 'Error cancelling order',
      error: error.message 
    });
  } finally {
    session.endSession();
  }
};

// Return order
export const returnOrder = asyncHandler(async (req, res) => {
    const { reason, additionalDetails } = req.body;
    const { id: orderId, itemId } = req.params;
    
    const order = await Order.findOne({
        orderId: orderId,
        user: req.user._id
    });

    if (!order) {
        res.status(HttpStatus.NOT_FOUNDyy);
        throw new Error('Order not found');
    }

    // Find the specific item
    const item = order.items.find(item => item._id.toString() === itemId);
    
    if (!item) {
        res.status(HttpStatus.NOT_FOUNDyy);
        throw new Error('Order item not found');
    }

    // Check if order status is Delivered
    if (order.orderStatus !== 'Delivered') {
        res.status(HttpStatus.BAD_REQUEST);
        throw new Error('Order must be delivered before requesting return');
    }

    // Check if return is already requested for this item
    if (item.returnRequested) {
        res.status(HttpStatus.BAD_REQUEST);
        throw new Error('Return already requested for this item');
    }

    // Update specific item status
    item.returnRequested = true;
    item.returnReason = reason;
    item.additionalDetails = additionalDetails;
    item.returnStatus = 'Return Pending';

    await order.save();

    res.json({
        success: true,
        message: 'Return request submitted successfully',
        order
    });
});

export const pdfDownloader = asyncHandler(async (req, res) => {
    const { orderId } = req.params;

    const order = await Order.findOne({ orderId })
        .populate('user', 'firstname lastname email')
        .populate('items.product', 'name')
        .populate('items.sizeVariant', 'size color price')
        .populate('shipping.address');

    if (!order) {
        return res.status(HttpStatus.NOT_FOUNDyy).json({ message: "Order not found" });
    }

    const doc = new PDFDocument({ 
        margin: 50,
        size: 'A4'
    });

    const filePath = path.join(__dirname, `../invoices/invoice-${orderId}.pdf`);

    if (!fs.existsSync(path.join(__dirname, '../invoices'))) {
        fs.mkdirSync(path.join(__dirname, '../invoices'));
    }

    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    // Helper function for drawing borders
    const drawBorder = () => {
        doc.lineWidth(1)
           .rect(40, 40, doc.page.width - 80, doc.page.height - 80)
           .stroke();
    };

    // Add decorative border
    drawBorder();

    // Add company header with styling
    doc.fontSize(24)
       .font('Helvetica-Bold')
       .text("VINTAGE", { align: "center" });
    
    doc.fontSize(12)
       .font('Helvetica')
       .text("Your Fashion Destination", { align: "center" });

    // Add decorative line with gradient
    doc.lineWidth(2);
    const gradient = doc.linearGradient(50, doc.y + 10, 550, doc.y + 10);
    gradient.stop(0, '#000000')
           .stop(0.5, '#666666')
           .stop(1, '#000000');
    doc.moveTo(50, doc.y + 10)
       .lineTo(550, doc.y + 10)
       .stroke(gradient);

    doc.moveDown(2);

    // Add invoice title with background
    doc.rect(doc.x, doc.y, 500, 30).fill('#f0f0f0');
    doc.fontSize(16)
       .font('Helvetica-Bold')
       .fillColor('#000000')
       .text("INVOICE", { align: "center" });

    doc.moveDown();

    // Create styled info boxes
    const drawInfoBox = (title, content, x, y, width) => {
        doc.rect(x, y, width, 80)
           .lineWidth(1)
           .stroke();
        
        // Title background
        doc.rect(x, y, width, 20)
           .fill('#f0f0f0');
        
        // Title
        doc.fontSize(10)
           .font('Helvetica-Bold')
           .fillColor('#000000')
           .text(title, x + 5, y + 5, { width: width - 10 });
        
        // Content
        doc.fontSize(9)
           .font('Helvetica')
           .text(content, x + 5, y + 25, { width: width - 10 });
    };

    // Draw info boxes
    const startY = doc.y;
    drawInfoBox(
        "BILLED TO",
        `${order.user.firstname} ${order.user.lastname}\n${order.user.email}`,
        50, startY, 240
    );

    drawInfoBox(
        "ORDER DETAILS",
        `Order ID: ${order.orderId}\nDate: ${new Date(order.createdAt).toLocaleDateString()}\nPayment: ${order.payment.method.toUpperCase()}`,
        310, startY, 240
    );

    doc.moveDown(4);

    drawInfoBox(
        "SHIPPING ADDRESS",
        `${order.shipping.address.fullName}\n${order.shipping.address.street}\n${order.shipping.address.city}, ${order.shipping.address.state} ${order.shipping.address.postalCode}\nPhone: ${order.shipping.address.phone}`,
        50, doc.y, 500
    );

    doc.moveDown(5);

    // Create styled table
    const createTable = () => {
        const tableTop = doc.y + 10;
        const tableHeaders = ['Item', 'Description', 'Qty', 'Price', 'Total'];
        const columnWidths = [40, 220, 60, 90, 90];
        let xPosition = 50;

        // Draw table header
        doc.rect(50, tableTop, 500, 20).fill('#f0f0f0');
        tableHeaders.forEach((header, i) => {
            doc.fontSize(10)
               .font('Helvetica-Bold')
               .fillColor('#000000')
               .text(header, xPosition, tableTop + 5, { width: columnWidths[i], align: 'center' });
            xPosition += columnWidths[i];
        });

        // Draw table content
        let currentY = tableTop + 20;
        order.items.forEach((item, index) => {
            xPosition = 50;
            doc.rect(50, currentY, 500, 30).stroke();
            
            doc.fontSize(9)
               .font('Helvetica')
               .text(`${index + 1}`, xPosition, currentY + 10, { width: columnWidths[0], align: 'center' });
            xPosition += columnWidths[0];
            
            doc.text(`${item.product.name}\n${item.sizeVariant.size}/${item.sizeVariant.color}`, xPosition, currentY + 5, { width: columnWidths[1] });
            xPosition += columnWidths[1];
            
            doc.text(`${item.quantity}`, xPosition, currentY + 10, { width: columnWidths[2], align: 'center' });
            xPosition += columnWidths[2];
            
            doc.text(`₹${item.price}`, xPosition, currentY + 10, { width: columnWidths[3], align: 'right' });
            xPosition += columnWidths[3];
            
            doc.text(`₹${item.finalPrice}`, xPosition, currentY + 10, { width: columnWidths[4], align: 'right' });
            
            currentY += 30;
        });

        return currentY;
    };

    const tableEndY = createTable();

    // Add styled totals section
    doc.rect(350, tableEndY + 10, 200, 100)
       .lineWidth(1)
       .stroke();

    const totalsY = tableEndY + 20;
    ['Subtotal:', 'Shipping:', 'Discount:', 'TOTAL:'].forEach((label, index) => {
        const isTotal = index === 3;
        doc.fontSize(isTotal ? 12 : 10)
           .font(isTotal ? 'Helvetica-Bold' : 'Helvetica')
           .text(label, 360, totalsY + (index * 20));
        
        const value = [
            `₹${order.totalAmount - order.shipping.deliveryCharge}`,
            `₹${order.shipping.deliveryCharge}`,
            `₹${order.totalDiscount || 0}`,
            `₹${order.totalAmount}`
        ][index];

        doc.text(value, 460, totalsY + (index * 20), { align: 'right' });
    });

    // Add styled footer
    doc.rect(50, doc.page.height - 100, 500, 40)
       .fill('#f0f0f0');
    
    doc.fontSize(8)
       .font('Helvetica')
       .fillColor('#000000')
       .text('Thank you for shopping with Vintage!', { align: 'center' })
       .text('For any queries, please contact support@vintage.com', { align: 'center' });

    doc.end();

    stream.on("finish", () => {
        res.download(filePath, `invoice-${order.orderId}.pdf`, (err) => {
            if (err) {
                console.error("Download error:", err);
                res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ message: "Error downloading invoice" });
            }
            fs.unlinkSync(filePath);
        });
    });
});

const calculateReturnAmount = (orderItem, order) => {
  // Get the original item price and quantity
  const originalItemTotal = orderItem.price * orderItem.quantity;
  
  // Calculate product discount
  const productDiscount = orderItem.price - orderItem.discountPrice;
  const totalProductDiscount = productDiscount * orderItem.quantity;
  
  // Calculate proportional coupon discount if coupon was applied
  let couponDiscountShare = 0;
  if (order.couponCode && order.discountAmount > 0) {
    // Calculate this item's share of the total coupon discount
    const itemSharePercentage = orderItem.finalPrice / order.subtotal;
    couponDiscountShare = order.discountAmount * itemSharePercentage;
  }
  
  // Calculate final return amount
  const returnAmount = originalItemTotal - totalProductDiscount - couponDiscountShare;
  
  return {
    returnAmount,
    productDiscount: totalProductDiscount,
    couponDiscountShare
  };
};

export const processReturn = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const { orderId, itemId } = req.body;
      const order = await Order.findOne({ orderId }).session(session);
      
      if (!order) {
        throw new Error('Order not found');
      }
      
      const orderItem = order.items.find(item => item._id.toString() === itemId);
      if (!orderItem) {
        throw new Error('Order item not found');
      }
      
      // Calculate return amounts
      const { returnAmount } = calculateReturnAmount(orderItem, order);
      
      // Process refund to wallet
      const refundSuccess = await processReturnRefund(
        orderId,
        order.user,
        returnAmount,
        `Refund for returned item from order #${order.orderId}`
      );

      if (!refundSuccess) {
        throw new Error('Failed to process refund to wallet');
      }
      
      // Update item status
      orderItem.status = 'Returned';
      orderItem.returnProcessed = true;
      await order.save({ session });
      
      res.json({
        success: true,
        message: 'Return processed and refund added to wallet successfully',
        returnAmount,
        updatedOrder: order
      });
    });
  } catch (error) {
    await session.abortTransaction();
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ message: error.message });
  } finally {
    session.endSession();
  }
};