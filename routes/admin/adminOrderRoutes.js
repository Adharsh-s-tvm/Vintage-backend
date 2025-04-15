import express from 'express';
import { 
  getAllOrders, 
  updateOrderStatus, 
  updateReturnStatus,
  getReturnRequests,
  handleReturnRequest // Add this import
} from '../../controllers/admin/adminOrderController.js';

const router = express.Router();

router.get('/', getAllOrders);
router.get('/returns', getReturnRequests);
router.patch('/:orderId/status', updateOrderStatus);
router.put('/:orderId/items/:itemId/return', handleReturnRequest); // Add this route

export default router;