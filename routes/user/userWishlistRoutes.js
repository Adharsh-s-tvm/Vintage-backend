import express from 'express';
import { authenticate } from '../../middlewares/authMiddleware.js';
import {
    addToWishlist,
    removeFromWishlist,
    getWishlist
} from '../../controllers/user/userWishlistController.js';

const router = express.Router();

router.route('/')
    .get(authenticate, getWishlist)
    .post(authenticate, addToWishlist);

router.delete('/:variantId', authenticate, removeFromWishlist);

export default router;
