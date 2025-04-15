import { HttpStatus } from '../utils/httpStatus.js';
import User from '../models/userModel.js';

const checkBlockedUser = async (req, res, next) => {
    try {
        // Skip check if no user is authenticated
        if (!req.user) {
            return next();
        }

        // Find user and check status
        const user = await User.findById(req.user._id);
        
        if (!user) {
            return res.status(HttpStatus.NOT_FOUND).json({
                success: false,
                message: 'User not found'
            });
        }

        // Check if user is banned
        if (user.status === 'banned') {
            // Clear the authentication token
            res.clearCookie('jwt', {
                httpOnly: true,
                secure: process.env.NODE_ENV !== 'development',
                sameSite: 'strict',
                path: '/'
            });

            return res.status(HttpStatus.FORBIDDEN).json({
                success: false,
                message: 'Your account has been banned. Please contact support for assistance.',
                isBlocked: true
            });
        }

        next();
    } catch (error) {
        console.error('Error in checkBlockedUser middleware:', error);
        res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
};

export default checkBlockedUser;