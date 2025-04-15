import express from 'express';
import { getAllTransactions, getTransactionDetails } from '../../controllers/admin/adminWalletController.js';
import { authorizeAdmin } from '../../middlewares/authMiddleware.js';

const router = express.Router();

// Get all wallet transactions
router.get('/', authorizeAdmin, getAllTransactions);

// Get transaction details by ID
router.get('/:transactionId', authorizeAdmin, getTransactionDetails);

export default router;
