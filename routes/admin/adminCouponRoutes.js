import express from 'express';
import { addCoupon, getAllCoupons, updateCoupon, toggleCouponStatus } from '../../controllers/admin/adminCouponController.js';
import asyncHandler from '../../middlewares/asyncHandler.js';

const router = express.Router();

router.post('/', asyncHandler(addCoupon));
router.get('/', asyncHandler(getAllCoupons));
router.put('/:id', asyncHandler(updateCoupon));
router.patch('/:id/toggle-status', asyncHandler(toggleCouponStatus));

export default router;