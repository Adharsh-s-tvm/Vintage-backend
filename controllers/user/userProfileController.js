import User from '../../models/userModel.js';
import Address from '../../models/userAddressModel.js';
import asyncHandler from '../../middlewares/asyncHandler.js';
import cloudinary from '../../config/cloudinary.js';
import bcrypt from 'bcryptjs';
import { HttpStatus } from '../../utils/httpStatus.js';

// @desc    Get user details
// @route   GET /api/user/profile/details
// @access  Private
export const getUserDetails = asyncHandler(async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select('-password');

        if (!user) {
            return res.status(HttpStatus.NOT_FOUND).json({ message: 'User not found' });
        }

        res.json({
            _id: user._id,
            firstname: user.firstname,
            lastname: user.lastname,
            email: user.email,
            username: user.username,
            phone: user.phone,
            image: user.image,
            referralCode: user.referralCode,
            createdAt: user.createdAt
        });
    } catch (error) {
        console.error('Error in getUserDetails:', error);
        res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ message: 'Server error' });
    }
});

// @desc    Get user addresses
// @route   GET /api/user/profile/address
// @access  Private
export const getUserAddresses = asyncHandler(async (req, res) => {
    try {
        // Verify user exists in request
        if (!req.user || !req.user._id) {
            return res.status(HttpStatus.UNAUTHORIZED).json({ message: 'Not authorized' });
        }

        const addresses = await Address.find({ user: req.user._id });
        res.json(addresses);
    } catch (error) {
        console.error('Error fetching addresses:', error);
        res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ message: 'Failed to fetch addresses' });
    }
});

// @desc    Add new address
// @route   POST /api/user/profile/address
// @access  Private
export const addUserAddress = asyncHandler(async (req, res) => {
    try {
        // Verify user exists in request
        if (!req.user || !req.user._id) {
            return res.status(HttpStatus.UNAUTHORIZED).json({ message: 'Not authorized' });
        }

        const {
            fullName,
            phone,
            street,
            city,
            state,
            country,
            postalCode,
            isDefault
        } = req.body;

        // Validate required fields
        if (!fullName || !phone || !street || !city || !state || !postalCode) {
            return res.status(HttpStatus.BAD_REQUEST).json({ message: 'Please fill all required fields' });
        }

        // If this address is set as default, unset any existing default address
        if (isDefault) {
            await Address.updateMany(
                { user: req.user._id },
                { $set: { isDefault: false } }
            );
        }

        const newAddress = await Address.create({
            user: req.user._id,
            fullName,
            phone,
            street,
            city,
            state,
            country: country || 'India', // Set default country if not provided
            postalCode,
            isDefault
        });

        res.status(HttpStatus.CREATED).json(newAddress);
    } catch (error) {
        console.error('Error adding address:', error);
        res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ message: 'Failed to add address' });
    }
});

// @desc    Update address
// @route   PUT /api/user/profile/address/:id
// @access  Private
export const updateUserAddress = asyncHandler(async (req, res) => {
    try {
        const address = await Address.findOne({
            _id: req.params.id,
            user: req.user._id
        });

        if (!address) {
            return res.status(HttpStatus.NOT_FOUND).json({ message: 'Address not found' });
        }

        if (req.body.isDefault) {
            await Address.updateMany(
                { user: req.user._id },
                { $set: { isDefault: false } }
            );
        }

        const updatedAddress = await Address.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true }
        );

        res.json(updatedAddress);
    } catch (error) {
        console.error('Error updating address:', error);
        res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ message: 'Failed to update address' });
    }
});

// @desc    Delete address
// @route   DELETE /api/user/profile/address/:id
// @access  Private
export const deleteUserAddress = asyncHandler(async (req, res) => {
    try {
        const address = await Address.findOneAndDelete({
            _id: req.params.id,
            user: req.user._id
        });

        if (!address) {
            return res.status(HttpStatus.NOT_FOUND).json({ message: 'Address not found' });
        }

        res.json({ message: 'Address removed successfully' });
    } catch (error) {
        console.error('Error deleting address:', error);
        res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ message: 'Failed to delete address' });
    }
});

// @desc    Update user details
// @route   PUT /api/user/profile/details
// @access  Private
export const updateUserDetails = asyncHandler(async (req, res) => {
    try {
        const user = await User.findById(req.user._id);

        if (!user) {
            return res.status(HttpStatus.NOT_FOUND).json({ message: 'User not found' });
        }

        // Update only the fields that are provided
        const {
            firstname,
            lastname,
            email,
            username,
            phone,
            image
        } = req.body;

        if (phone) {
            const isValidPhone = (phone) => /^[0-9]{10}$/.test(phone);
            if (!isValidPhone(phone)) {
                return res.status(HttpStatus.BAD_REQUEST).json({ message: 'Invalid phone number' });
            }
        }

        if (firstname) user.firstname = firstname;
        if (lastname) user.lastname = lastname;
        if (email) user.email = email;
        if (username) user.username = username;
        if (phone) user.phone = phone;
        if (image) user.image = image;

        const updatedUser = await user.save();

        res.json({
            _id: updatedUser._id,
            firstname: updatedUser.firstname,
            lastname: updatedUser.lastname,
            email: updatedUser.email,
            username: updatedUser.username,
            phone: updatedUser.phone,
            image: updatedUser.image,
            createdAt: updatedUser.createdAt
        });
    } catch (error) {
        console.error('Error updating user details:', error);
        res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ message: 'Failed to update user details' });
    }
});

// @desc    Upload profile image
// @route   POST /api/user/profile/upload-image
// @access  Private
export const uploadProfileImage = asyncHandler(async (req, res) => {
    try {
        if (!req.file) {
            return res.status(HttpStatus.BAD_REQUEST).json({ message: 'No image file provided' });
        }

        // Get the uploaded file URL from Cloudinary (already handled by your multer setup)
        const imageUrl = req.file.path;

        // Update user's image URL in database
        const user = await User.findById(req.user._id);
        if (!user) {
            return res.status(HttpStatus.NOT_FOUND).json({ message: 'User not found' });
        }

        user.image = imageUrl;
        await user.save();

        res.json({
            imageUrl: imageUrl,
            message: 'Profile image uploaded successfully'
        });

    } catch (error) {
        console.error('Error uploading image:', error);
        res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
            message: 'Failed to upload image',
            error: error.message
        });
    }
});

// @desc    Change user password
// @route   PUT /api/user/profile/change-password
// @access  Private
export const changePassword = asyncHandler(async (req, res) => {
    try {
        const { oldPassword, newPassword } = req.body;

        // Find user
        const user = await User.findById(req.user._id);
        if (!user) {
            return res.status(HttpStatus.NOT_FOUND).json({ message: 'User not found' });
        }

        // Verify old password
        const isMatch = await bcrypt.compare(oldPassword, user.password);
        if (!isMatch) {
            return res.status(HttpStatus.BAD_REQUEST).json({ message: 'Current password is incorrect' });
        }

        // Check if new password is same as old password
        const isSamePassword = await bcrypt.compare(newPassword, user.password);
        if (isSamePassword) {
            return res.status(HttpStatus.BAD_REQUEST).json({
                message: 'New password cannot be the same as your current password'
            });
        }

        // Password validation (optional but recommended)
        if (newPassword.length < 6) {
            return res.status(HttpStatus.BAD_REQUEST).json({
                message: 'Password must be at least 6 characters long'
            });
        }

        // Hash new password
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(newPassword, salt);

        // Save user with new password
        await user.save();

        res.json({ message: 'Password updated successfully' });
    } catch (error) {
        console.error('Error in changePassword:', error);
        res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ message: 'Failed to change password' });
    }
});


// Add this function to your existing userController.js file

export const updateUserEmail = async (req, res) => {
    try {
        const { email } = req.body;
        const userId = req.user._id;

        if (!email) {
            return res.status(HttpStatus.BAD_REQUEST).json({ message: 'Email is required' });
        }

        // Check if email already exists for another user
        const existingUser = await User.findOne({ email, _id: { $ne: userId } });
        if (existingUser) {
            return res.status(HttpStatus.BAD_REQUEST).json({ message: 'Email already in use by another account' });
        }

        // Update user's email
        const updatedUser = await User.findByIdAndUpdate(
            userId,
            { email },
            { new: true }
        ).select('-password');

        if (!updatedUser) {
            return res.status(HttpStatus.NOT_FOUND).json({ message: 'User not found' });
        }

        res.status(HttpStatus.OK).json({
            _id: updatedUser._id,
            firstname: updatedUser.firstname,
            lastname: updatedUser.lastname,
            email: updatedUser.email,
            username: updatedUser.username,
            phone: updatedUser.phone,
            image: updatedUser.image,
            isAdmin: updatedUser.isAdmin
        });
    } catch (error) {
        console.error('Error updating email:', error);
        res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ message: 'Failed to update email' });
    }
};