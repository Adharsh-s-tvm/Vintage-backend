import express from 'express';
import { authenticate } from '../middlewares/authMiddleware.js';
import { authorizeAdmin } from '../middlewares/authMiddleware.js';
import { 
  getUserMessages, 
  sendMessage, 
  getAdminMessages,
  getChatUsers 
} from '../controllers/messageController.js';

const router = express.Router();

// User routes
router.get('/user/messages', authenticate, getUserMessages);
router.post('/user/messages', authenticate, sendMessage);

// Admin routes
router.get('/admin/messages/:userId', authorizeAdmin, getAdminMessages);
router.post('/admin/messages', authorizeAdmin, sendMessage);
router.get('/admin/chat-users', authorizeAdmin, getChatUsers);

export default router;