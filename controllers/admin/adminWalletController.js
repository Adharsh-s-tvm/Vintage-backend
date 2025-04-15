import Wallet from '../../models/walletModel.js';
import User from '../../models/userModel.js';
import { HttpStatus } from '../../utils/httpStatus.js';

export const getAllTransactions = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    // Aggregate to get all transactions across wallets
    const result = await Wallet.aggregate([
      { $unwind: '$transactions' },
      {
        $lookup: {
          from: 'users',
          localField: 'userId',
          foreignField: '_id',
          as: 'user'
        }
      },
      { $unwind: '$user' },
      {
        $project: {
          transactionId: '$transactions._id',
          type: '$transactions.type',
          amount: '$transactions.amount',
          description: '$transactions.description',
          date: '$transactions.date',
          user: {
            _id: '$user._id',
            name: '$user.name',
            email: '$user.email'
          }
        }
      },
      { $sort: { date: -1 } },
      {
        $facet: {
          metadata: [{ $count: 'total' }],
          transactions: [{ $skip: skip }, { $limit: limit }]
        }
      }
    ]);

    const totalTransactions = result[0].metadata[0]?.total || 0;
    const transactions = result[0].transactions;

    res.status(HttpStatus.OK).json({
      success: true,
      data: {
        transactions,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalTransactions / limit),
          totalTransactions,
          limit
        }
      }
    });
  } catch (error) {
    console.error('Error in getAllTransactions:', error);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: error.message || 'Internal server error'
    });
  }
};

// Get transaction details by ID
export const getTransactionDetails = async (req, res) => {
  try {
    const { transactionId } = req.params;
    
    const wallet = await Wallet.findOne({ 'transactions._id': transactionId })
      .populate('userId', 'name email phone');

    if (!wallet) {
      return res.status(HttpStatus.NOT_FOUND).json({ message: 'Transaction not found' });
    }

    const transaction = wallet.transactions.id(transactionId);
    
    res.status(HttpStatus.OK).json({
      transactionId: transaction._id,
      user: wallet.userId,
      type: transaction.type,
      amount: transaction.amount,
      description: transaction.description,
      date: transaction.date
    });
  } catch (error) {
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ message: error.message });
  }
};
