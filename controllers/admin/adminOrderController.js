import Order from "../../models/product/orderModel.js";
import mongoose from "mongoose";
import Variant from "../../models/product/sizeVariantModel.js";
import { processReturnRefund } from '../user/userWalletController.js';
import { HttpStatus } from "../../utils/httpStatus.js";

export const getAllOrders = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 5;
    const search = req.query.search || '';
    const filter = req.query.filter || 'all';
    const sortField = req.query.sort || 'createdAt';
    const sortOrder = req.query.order || 'desc';

    // Build filter query
    let filterQuery = {};
    
    // Add search conditions if search query exists
    if (search) {
      filterQuery.$or = [
        { orderId: { $regex: search, $options: 'i' } },
        { 'user.fullname': { $regex: search, $options: 'i' } }
      ];
    }

    // Add status filter if not 'all'
    if (filter !== 'all') {
      filterQuery.orderStatus = filter;
    }

    // Build sort object
    let sortObj = {};
    sortObj[sortField] = sortOrder === 'desc' ? -1 : 1;

    // Get total count for pagination
    const total = await Order.countDocuments(filterQuery);

    // Fetch orders with filters, sorting and pagination
    const orders = await Order.find(filterQuery)
      .populate('user', 'fullname email')
      .sort(sortObj)
      .skip((page - 1) * limit)
      .limit(limit);

    res.json({
      orders,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalOrders: total,
        hasNextPage: page * limit < total,
        hasPrevPage: page > 1,
        limit
      }
    });

  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ 
      message: "Failed to fetch orders",
      error: error.message 
    });
  }
};

export const updateOrderStatus = async (req, res) => {
  
  try {
    const { orderId } = req.params;
    const { status } = req.body;

    const order = await Order.findByIdAndUpdate(
      orderId,
      { orderStatus: status },
      { new: true }
    );

    if (!order) {
      return res.status(HttpStatus.NOT_FOUND).json({ message: "Order not found" });
    }

    res.status(HttpStatus.OK).json(order);
  } catch (error) {
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ message: "Failed to update order status", error: error.message });
  }
};

export const updateReturnStatus = async (req, res) => {
  console.log("updateReturnStatus called");
  
  try {
    const { orderId } = req.params;
    const { approved } = req.body;

    const order = await Order.findById(orderId).populate('items.sizeVariant');
    
    if (!order) {
      return res.status(HttpStatus.NOT_FOUND).json({ message: "Order not found" });
    }

    if (approved) {
      // Start a session for transaction
      const session = await mongoose.startSession();
      await session.withTransaction(async () => {
        // Update order status
        order.orderStatus = 'Returned';
        
        // Update all items status and restore stock
        for (const item of order.items) {
          item.status = 'Returned';
          item.returnStatus = 'Return Approved';
          
          // Restore stock
          await Variant.findByIdAndUpdate(
            item.sizeVariant._id,
            { $inc: { stock: item.quantity } },
            { session }
          );
        }

        await order.save({ session });
      });

      await session.endSession();
    } else {
      // Reject return request
      order.items = order.items.map(item => ({
        ...item,
        returnStatus: 'Return Rejected'
      }));
      await order.save();
    }

    res.status(HttpStatus.OK).json(order);
  } catch (error) {
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ 
      message: "Failed to update return status", 
      error: error.message 
    });
  }
};

// Update getReturnRequests to handle search and pagination
export const getReturnRequests = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 5;
    const search = req.query.search || '';
    const status = req.query.status || 'all';

    // Build filter query
    let filterQuery = {
      'items': {
        $elemMatch: {
          'returnRequested': true
        }
      }
    };

    // Add search conditions if search exists
    if (search) {
      filterQuery.$or = [
        { orderId: { $regex: search, $options: 'i' } },
        { 'user.fullname': { $regex: search, $options: 'i' } },
        { 'items.product.name': { $regex: search, $options: 'i' } }
      ];
    }

    // Add status filter if not 'all'
    if (status !== 'all') {
      filterQuery['items.returnStatus'] = status;
    }

    // Calculate skip value
    const skip = (page - 1) * limit;

    // Get total count for pagination
    const total = await Order.countDocuments(filterQuery);

    // Fetch returns with filters and pagination
    const returns = await Order.find(filterQuery)
      .populate('user', 'fullname email')
      .populate({
        path: 'items.product',
        select: 'name images'
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // Send response with pagination metadata
    res.json({
      returns,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalReturns: total,
        hasNextPage: page * limit < total,
        hasPrevPage: page > 1,
        limit
      }
    });

  } catch (error) {
    console.error('Error fetching returns:', error);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ 
      success: false,
      message: "Failed to fetch returns",
      error: error.message 
    });
  }
};

// Add this controller function for handling return requests
export const handleReturnRequest = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    await session.startTransaction();
    const { orderId, itemId } = req.params;
    const { action } = req.body;

    const order = await Order.findById(orderId)
      .populate('items.product')
      .populate('items.sizeVariant');
      
    if (!order) {
      throw new Error('Order not found');
    }

    // Find the specific item in the order
    const itemIndex = order.items.findIndex(item => item._id.toString() === itemId);
    if (itemIndex === -1) {
      throw new Error('Order item not found');
    }

    const item = order.items[itemIndex];

    if (action === 'accept') {
      // Update the specific item's status
      order.items[itemIndex].returnStatus = 'Return Approved';
      order.items[itemIndex].status = 'Returned';
      
      // Update inventory
      await Variant.findByIdAndUpdate(
        item.sizeVariant._id, 
        { $inc: { stock: item.quantity } },
        { session }
      );

      // Process refund for online payments
      if (order.payment?.method) {
        let refundAmount = item.finalPrice;
        
        // Check if this is the first return and if there was a coupon applied
        const hasOtherReturns = order.items.some((i, idx) => 
          idx !== itemIndex && i.returnStatus === 'Return Approved'
        );
        
        console.log('Coupon Discount:', order.couponDiscount);
        console.log('Has Other Returns:', hasOtherReturns);
        console.log('Original Refund Amount:', refundAmount);
        
        if (!hasOtherReturns && order.couponDiscount > 0) {
          // Calculate the proportion of the item's price to the total order amount
          const itemProportion = item.finalPrice / order.totalAmount;
          const couponDeduction = order.couponDiscount * itemProportion;
          
          console.log('Item Proportion:', itemProportion);
          console.log('Coupon Deduction:', couponDeduction);
          
          // Subtract the proportional coupon discount from the refund amount
          refundAmount -= couponDeduction;
          
          console.log('Final Refund Amount:', refundAmount);
        }
        
        const refundSuccess = await processReturnRefund(
          order.orderId,
          order.user,
          refundAmount,
          `Refund for returned item from order #${order.orderId}`,
          session
        );

        if (!refundSuccess) {
          throw new Error('Failed to process refund to wallet');
        }

        order.items[itemIndex].returnProcessed = true;
        order.items[itemIndex].returnStatus = 'Refunded';
      }
    } else if (action === 'reject') {
      order.items[itemIndex].returnStatus = 'Return Rejected';
    }

    await order.save({ session });
    await session.commitTransaction();

    res.status(HttpStatus.OK).json({
      success: true,
      message: `Return request ${action}ed successfully`,
      order
    });
  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    console.error('Error in handleReturnRequest:', error);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ 
      success: false,
      message: "Failed to handle return request",
      error: error.message 
    });
  } finally {
    session.endSession();
  }
};

const handleReturnAction = async (orderId, itemId, action) => {
  try {
    const response = await axios.put(
      `${api}/admin/orders/${orderId}/items/${itemId}/return`,
      { action },
      { headers: { Authorization: `Bearer ${localStorage.getItem('jwt')}` } }
    );
    
    if (response.data) {
      toast.success(`Return request ${action}ed successfully`);
      fetchReturns();
    } else {
      toast.error(`Failed to ${action} return request`);
    }
  } catch (error) {
    console.error('Action error:', error);
    toast.error(error.response?.data?.message || `Failed to ${action} return request`);
  }
};