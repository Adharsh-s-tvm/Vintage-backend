import Wallet from '../../models/walletModel.js';
import Order from '../../models/product/orderModel.js';
import asyncHandler from '../../middlewares/asyncHandler.js';
import mongoose from 'mongoose';

// Get wallet details
export const getWalletDetails = asyncHandler(async (req, res) => {
  try {
    // Get page and limit from query params
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = 5; // Fixed limit of 5 items per page
    
    // Find wallet
    let wallet = await Wallet.findOne({ userId: req.user._id });
    
    if (!wallet) {
      wallet = await Wallet.create({
        userId: req.user._id,
        balance: 0,
        transactions: []
      });
    }

    // Calculate pagination
    const totalTransactions = wallet.transactions.length;
    const totalPages = Math.ceil(totalTransactions / limit);
    const startIndex = (page - 1) * limit;
    
    // Get transactions for current page
    const paginatedTransactions = wallet.transactions
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(startIndex, startIndex + limit);

    res.json({
      success: true,
      wallet: {
        balance: wallet.balance
      },
      transactions: paginatedTransactions,
      pagination: {
        currentPage: page,
        totalPages,
        totalTransactions
      }
    });
  } catch (error) {
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ 
      success: false,
      message: "Failed to fetch wallet details"
    });
  }
});

// Process refund for canceled order
export const processCancelRefund = async (orderId, userId) => {
  try {
    const order = await Order.findById(orderId);
    if (!order) throw new Error('Order not found');

    let wallet = await Wallet.findOne({ userId });
    if (!wallet) {
      wallet = new Wallet({ userId, balance: 0 });
    }

    // Add refund transaction
    const refundAmount = order.totalAmount;
    wallet.balance += refundAmount;
    wallet.transactions.push({
      type: 'credit',
      amount: refundAmount,
      description: `Refund for cancelled order #${order._id}`,
      date: new Date()
    });

    await wallet.save();
    return true;
  } catch (error) {
    console.error('Refund processing error:', error);
    return false;
  }
};

// Process refund for returned order
export const processReturnRefund = async (orderId, userId, amount, description, session) => {
  try {
    let wallet = await Wallet.findOne({ userId }).session(session);
    
    if (!wallet) {
      wallet = await Wallet.create([{
        userId,
        balance: 0,
        transactions: []
      }], { session });
      wallet = wallet[0];
    }

    wallet.balance += amount;
    wallet.transactions.push({
      userId,
      type: 'credit',
      amount,
      description: description || `Refund for order #${orderId}`,
      date: new Date()
    });

    await wallet.save({ session });
    return true;
  } catch (error) {
    console.error('Return refund processing error:', error);
    return false;
  }
};