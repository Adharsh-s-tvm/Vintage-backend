import Admin from "../../models/adminModel.js";
import jwt from "jsonwebtoken";
import asyncHandler from "../../middlewares/asyncHandler.js";
import User from "../../models/userModel.js";
import bcrypt from "bcrypt";
import { HttpStatus } from "../../utils/httpStatus.js";




const loginAdmin = asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    const admin = await Admin.findOne({ email });

    if (!admin) {
        res.status(HttpStatus.UNAUTHORIZED);
        throw new Error("Admin not found");
    }

    if (!admin.isAdmin) {
        res.status(HttpStatus.UNAUTHORIZED);
        throw new Error("Not authorized as admin");
    }

    const isPasswordValid = await bcrypt.compare(password, admin.password);

    if (!isPasswordValid) {
        res.status(HttpStatus.UNAUTHORIZED);
        throw new Error("Invalid password");
    }

    const token = jwt.sign(
        { id: admin._id, isAdmin: true },
        process.env.JWT_SECRET,
        { expiresIn: "1d" }
    );

    res.cookie("token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV !== "development",
        sameSite: "strict",
        maxAge: 24 * 60 * 60 * 1000, // 1 day
    });

    res.json({
        _id: admin._id,
        firstname: admin.firstname,
        lastname: admin.lastname,
        email: admin.email,
        isAdmin: admin.isAdmin,
    });
});


const logoutCurrentAdmin = asyncHandler(async (req, res) => {
    // Clear the token cookie
    res.cookie('token', '', {
        httpOnly: true,
        expires: new Date(0),
        secure: process.env.NODE_ENV !== 'development',
        sameSite: 'strict',
        path: '/'
    });

    // Clear any other admin-specific cookies if they exist
    res.cookie('jwt', '', {
        httpOnly: true,
        expires: new Date(0),
        secure: process.env.NODE_ENV !== 'development',
        sameSite: 'strict',
        path: '/'
    });

    res.status(HttpStatus.OK).json({ message: "Admin logged out successfully" });
});


const getAllUsers = asyncHandler(async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 5;
        const search = req.query.search || '';
        const filter = req.query.filter || 'all';

        // Build filter query
        let filterQuery = {};
        
        // Add search conditions if search query exists
        if (search) {
            filterQuery.$or = [
                { firstname: { $regex: search, $options: 'i' } },
                { lastname: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } }
            ];
        }

        // Add status/verification filters
        switch (filter) {
            case 'active':
                filterQuery.status = 'active';
                break;
            case 'banned':
                filterQuery.status = 'banned';
                break;
            case 'verified':
                filterQuery.isVerified = true;
                break;
            case 'unverified':
                filterQuery.isVerified = false;
                break;
            // 'all' case doesn't need additional filters
        }

        // Get total count for pagination
        const total = await User.countDocuments(filterQuery);

        // Fetch users with filters, pagination and sorting
        const users = await User.find(filterQuery)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .select('-password'); // Exclude password field

        res.json({
            users,
            pagination: {
                currentPage: page,
                totalPages: Math.ceil(total / limit),
                totalUsers: total,
                hasNextPage: page * limit < total,
                hasPrevPage: page > 1,
                limit
            }
        });

    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ 
            success: false, 
            message: 'Error fetching users',
            error: error.message 
        });
    }
});


const getUserById = asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id).select("-password");

    if (user) {
        res.json(user);
    } else {
        res.status(HttpStatus.NOT_FOUND);
        throw new Error("User not found");
    }
});


const updateUserById = asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id);

    if (user) {
        user.username = req.body.username || user.username;
        user.email = req.body.email || user.email;
        user.isAdmin = Boolean(req.body.isAdmin);

        const updatedUser = await user.save();

        res.json({
            _id: updatedUser._id,
            username: updatedUser.username,
            email: updatedUser.email,
            isAdmin: updatedUser.isAdmin,
        });
    } else {
        res.status(HttpStatus.NOT_FOUND);
        throw new Error("User not found");
    }
});


// Controller function for updating user status
export const updateUserStatus = asyncHandler(async (req, res) => {
    const { status } = req.body; // Expecting 'active' or 'banned'
    const userId = req.params.id;

    // Validate status
    if (!["active", "banned"].includes(status)) {
        return res.status(HttpStatus.BAD_REQUEST).json({ message: "Invalid status value" });
    }

    try {
        // Find user and update status
        const user = await User.findById(userId);

        if (!user) {
            return res.status(HttpStatus.NOT_FOUND).json({ message: "User not found" });
        }

        // Update user status
        user.status = status;
        await user.save();

        // Return success response
        res.status(HttpStatus.OK).json({ 
            message: `User ${status === 'active' ? 'activated' : 'banned'} successfully`, 
            user: {
                _id: user._id,
                firstname: user.firstname,
                lastname: user.lastname,
                email: user.email,
                status: user.status,
                isVerified: user.isVerified,
                isAdmin: user.isAdmin
            }
        });
    } catch (error) {
        console.error("Error updating user status:", error);
        res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ message: "Failed to update user status" });
    }
});



const deleteUserById = asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id);

    if (user) {
        if (user.isAdmin) {
            res.status(HttpStatus.BAD_REQUEST);
            throw new Error("Cannot delete admin user");
        }

        await User.deleteOne({ _id: user._id });
        res.json({ message: "User removed" });
    } else {
        res.status(HttpStatus.NOT_FOUND);
        throw new Error("User not found.");
    }
});


const getDashboard = asyncHandler(async (req, res) => {
    if (!req.admin || !req.admin.isAdmin) {
        res.status(HttpStatus.UNAUTHORIZED);
        throw new Error("Not authorized as admin");
    }

    res.status(HttpStatus.OK).json({
        success: true,
        message: "Admin dashboard access granted",
        admin: {
            id: req.admin._id,
            email: req.admin.email,
            name: `${req.admin.firstname} ${req.admin.lastname}`
        }
    });
});


export {
    loginAdmin,
    getAllUsers,
    deleteUserById,
    getUserById,
    updateUserById,
    logoutCurrentAdmin,
    getDashboard
};