import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
  senderId: { 
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  receiverId: { 
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  text: {
    type: String,
    required: true,
    trim: true
  },
  time: {
    type: Date,
    default: Date.now
  },
  isRead: {
    type: Boolean,
    default: false
  },
  isAdminMessage: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true, // Adds createdAt and updatedAt fields
  versionKey: false // Removes the __v field
});

// Index for faster queries
messageSchema.index({ senderId: 1, receiverId: 1 });

const Message = mongoose.model('Message', messageSchema);

export default Message;
