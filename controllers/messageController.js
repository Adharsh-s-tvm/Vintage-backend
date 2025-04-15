import Message from '../models/messageModel.js';
import User from '../models/userModel.js';
import Admin from '../models/adminModel.js';
import { HttpStatus } from '../utils/httpStatus.js';

// Get messages for a specific user
export const getUserMessages = async (req, res) => {
  try {
    const messages = await Message.find({
      $or: [
        { senderId: req.user._id },
        { receiverId: req.user._id }
      ]
    }).sort({ time: 1 });

    res.json(messages);
  } catch (error) {
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ message: error.message });
  }
};

// Get messages for admin with a specific user
export const getAdminMessages = async (req, res) => {
  try {
    const { userId } = req.params;
    const messages = await Message.find({
      $or: [
        { senderId: userId, receiverId: req.admin._id },
        { senderId: req.admin._id, receiverId: userId }
      ]
    }).sort({ time: 1 });

    res.json(messages);
  } catch (error) {
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ message: error.message });
  }
};

// Send message (works for both user and admin)
export const sendMessage = async (req, res) => {
  try {
    const { text, receiverId } = req.body;
    const senderId = req.user?._id || req.admin?._id;
    const isAdminMessage = !!req.admin;

    const message = new Message({
      senderId,
      receiverId,
      text,
      isAdminMessage
    });

    const savedMessage = await message.save();
    res.status(HttpStatus.CREATED).json(savedMessage);
  } catch (error) {
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ message: error.message });
  }
};

// Get all users who have chat history with admin
export const getChatUsers = async (req, res) => {
  try {
    const messages = await Message.find().distinct('senderId');
    const users = await User.find({
      _id: { $in: messages }
    }).select('firstname lastname email');

    res.json(users);
  } catch (error) {
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ message: error.message });
  }
};