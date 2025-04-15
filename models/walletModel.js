import mongoose from 'mongoose';

const walletTransactionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: ['credit', 'debit'],
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  date: {
    type: Date,
    default: Date.now
  }
});

const walletSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  balance: {
    type: Number,
    default: 0
  },
  transactions: [walletTransactionSchema]
}, {
  timestamps: true
});

// Pre-save hook to log transactions
walletSchema.pre('save', function (next) {
  if (this.isModified('transactions')) {
    const newTransactions = this.transactions.slice(-1)[0];
    console.log('New wallet transaction:', {
      userId: this.userId,
      transaction: newTransactions,
      newBalance: this.balance
    });
  }
  next();
});

const Wallet = mongoose.model('Wallet', walletSchema);
export default Wallet;
