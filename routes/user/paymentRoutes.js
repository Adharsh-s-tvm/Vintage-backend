import express from 'express';
import {
  createPaymentOrder,
  verifyPayment,
  cancelPayment,
  handlePaymentFailure
} from '../../controllers/user/paymentController.js';
import { authenticate } from '../../middlewares/authMiddleware.js';

const router = express.Router();

router.post('/create-order', authenticate, createPaymentOrder);
router.post('/verify', authenticate, verifyPayment);
router.post('/cancel', authenticate, cancelPayment);
router.post('/failed', authenticate, handlePaymentFailure);

export default router; 