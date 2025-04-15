import User from "../../models/userModel.js";
import Otp from "../../models/signUpOtpModel.js";
import asyncHandler from "../../middlewares/asyncHandler.js";
import bcrypt from "bcryptjs";
import createToken from "../../utils/createToken.js";
import axios from "axios";
import jwt from "jsonwebtoken";
import dotenv from 'dotenv'
import { oauth2client } from "../../utils/googleConfig.js";
import crypto from 'crypto';
import mongoose from 'mongoose';
import Wallet from "../../models/walletModel.js";
import { HttpStatus } from "../../utils/httpStatus.js";


dotenv.config()



const createUser = asyncHandler(async (req, res) => {
    const { firstname, lastname, email, password, referralCode } = req.body;

    if (!firstname || !lastname || !email || !password) {
        res.status(HttpStatus.BAD_REQUEST);
        throw new Error("Please fill all the inputs.");
    }

    const userExists = await User.findOne({ email });
    if (userExists) {
        res.status(HttpStatus.BAD_REQUEST);
        throw new Error("User already exists");
    }

    // Start a MongoDB session for transaction
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        // Check referral code and process bonus if valid
        if (referralCode) {
            const referralUser = await User.findOne({ referralCode });
            if (referralUser) {
                // Add bonus to referral user's wallet (1000)
                let referrerWallet = await Wallet.findOne({ userId: referralUser._id }).session(session);
                if (!referrerWallet) {
                    referrerWallet = await Wallet.create([{
                        userId: referralUser._id,
                        balance: 0,
                        transactions: []
                    }], { session });
                    referrerWallet = referrerWallet[0];
                }
                
                referrerWallet.balance += 1000;
                referrerWallet.transactions.push({
                    userId: referralUser._id,
                    type: 'credit',
                    amount: 1000,
                    description: `Referral bonus for inviting ${email}`,
                    date: new Date()
                });
                await referrerWallet.save({ session });
            }
        }

        // Create new user
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const baseUsername = `${firstname.toLowerCase()}_${lastname.toLowerCase()}`;
        let username = baseUsername;
        let counter = 1;

        while (await User.findOne({ username })) {
            username = `${baseUsername}${counter}`;
            counter++;
        }

        const newUser = await User.create([{
            firstname,
            lastname,
            username,
            email,
            password: hashedPassword
        }], { session });

        // Create wallet for new user with signup bonus (200)
        const newUserWallet = await Wallet.create([{
            userId: newUser[0]._id,
            balance: 200,
            transactions: [{
                userId: newUser[0]._id,
                type: 'credit',
                amount: 200,
                description: 'Signup bonus',
                date: new Date()
            }]
        }], { session });

        await session.commitTransaction();
        createToken(res, newUser[0]._id);

        res.status(HttpStatus.CREATED).json({
            _id: newUser[0]._id,
            firstname: newUser[0].firstname,
            lastname: newUser[0].lastname,
            username: newUser[0].username,
            email: newUser[0].email,
            isAdmin: newUser[0].isAdmin,
        });

    } catch (error) {
        await session.abortTransaction();
        console.error('Save error:', error);
        res.status(HttpStatus.BAD_REQUEST);
        throw new Error("Invalid user data");
    } finally {
        session.endSession();
    }
});

const loginUser = asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    const existingUser = await User.findOne({ email });

    if (!existingUser) {
        res.status(HttpStatus.UNAUTHORIZED);
        throw new Error("User not registered");
    }

    if (existingUser.status == 'banned') {
        res.status(HttpStatus.FORBIDDEN);
        throw new Error("Your account has been blocked. Contact support for assistance.");
    }

    const isPasswordValid = await bcrypt.compare(
        password,
        existingUser.password
    );

    if (!isPasswordValid) {
        res.status(HttpStatus.UNAUTHORIZED);
        throw new Error("Invalid password");
    }

    const token = createToken(res, existingUser._id);

    res.status(HttpStatus.OK).json({
        success: true,
        _id: existingUser._id,
        firstname: existingUser.firstname,
        lastname: existingUser.lastname,
        username: existingUser.username,
        email: existingUser.email,
        isAdmin: existingUser.isAdmin,
        token // Include token in response
    });
});

const logoutCurrentUser = asyncHandler(async (req, res) => {
    res.cookie("jwt", "", {
        httyOnly: true,
        expires: new Date(0),
    });

    res.status(HttpStatus.OK).json({ message: "Logged out successfully" });
});



const getCurrentUserProfile = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id);

    if (user) {
        res.json({
            _id: user._id,
            username: user.username,
            email: user.email,
        });
    } else {
        res.status(HttpStatus.NOT_FOUND);
        throw new Error("User not found.");
    }
});

const updateCurrentUserProfile = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id);

    if (user) {
        user.username = req.body.username || user.username;
        user.email = req.body.email || user.email;

        if (req.body.password) {
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(req.body.password, salt);
            user.password = hashedPassword;
        }

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


const googleLogin = asyncHandler(async (req, res) => {
    const { code } = req.body;

    try {
        // Get tokens from Google
        const { tokens } = await oauth2client.getToken(code);

        // Get user info using access token
        const userInfo = await axios.get(
            'https://www.googleapis.com/oauth2/v1/userinfo',
            {
                headers: { Authorization: `Bearer ${tokens.access_token}` }
            }
        );

        const { email, given_name: firstname, family_name } = userInfo.data;

        // Use family_name if available, otherwise use a default value
        const lastname = family_name || null;

        // Find or create user
        let user = await User.findOne({ email });

        if (!user) {
            // Generate username from email
            let username = email.split('@')[0];
            let counter = 1;

            // Ensure username is unique
            while (await User.findOne({ username })) {
                username = `${email.split('@')[0]}${counter}`;
                counter++;
            }

            // Create new user
            const randomPassword = crypto.randomBytes(32).toString('hex');
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(randomPassword, salt);

            user = await User.create({
                firstname,
                lastname,
                email,
                username,
                password: hashedPassword,
                authProvider: 'google'
            });
        }

        // Create JWT token
        const token = createToken(res, user._id);

        res.status(HttpStatus.OK).json({
            success: true,
            user: {
                _id: user._id,
                firstname: user.firstname,
                lastname: user.lastname,
                username: user.username,
                email: user.email,
                isAdmin: user.isAdmin,
            },
            token
        });

    } catch (error) {
        console.error('Google login error:', error);
        res.status(HttpStatus.UNAUTHORIZED).json({
            message: "Failed to authenticate with Google",
            error: error.message
        });
    }
});

const checkEmail = asyncHandler(async (req, res) => {
    console.log('called');

    const { email } = req.body;
    const user = await User.findOne({ email });

    res.json({ exists: !!user });
});

const resetPassword = asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const user = await User.findOne({ email });

    if (!user) {
        res.status(HttpStatus.NOT_FOUND);
        throw new Error("User not found");
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    user.password = hashedPassword;
    await user.save();

    res.json({ message: "Password reset successful" });
});

export const sendEmailChangeOtp = async (req, res) => {
    try {
        const { email } = req.body;
        const userId = req.user._id;

        // Check if email already exists for another user
        const existingUser = await User.findOne({ email, _id: { $ne: userId } });
        if (existingUser) {
            return res.status(HttpStatus.BAD_REQUEST).json({ message: 'Email already in use by another account' });
        }

        // Generate a 6-digit OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        
        // Store OTP in database with expiry (10 minutes)
        await User.findByIdAndUpdate(userId, {
            emailChangeOtp: otp,
            emailChangeOtpExpiry: Date.now() + 10 * 60 * 1000, // 10 minutes
            newEmail: email
        });

        // Send OTP to the new email address
        // Implement your email sending logic here
        // For example:
        // await sendEmail({
        //     to: email,
        //     subject: 'Email Change Verification',
        //     text: `Your OTP for email change is: ${otp}. It will expire in 10 minutes.`
        // });

        // For development, you can console log the OTP
        console.log(`OTP for email change: ${otp}`);

        res.status(HttpStatus.OK).json({ message: 'OTP sent to your new email address' });
    } catch (error) {
        console.error('Error sending email change OTP:', error);
        res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ message: 'Failed to send OTP' });
    }
};

export const verifyEmailChangeOtp = async (req, res) => {
    try {
        const { email, otp } = req.body;
        const userId = req.user._id;

        const user = await User.findById(userId);
        
        // Check if OTP matches and is not expired
        if (!user || user.emailChangeOtp !== otp || user.newEmail !== email) {
            return res.status(HttpStatus.BAD_REQUEST).json({ message: 'Invalid OTP' });
        }
        
        if (Date.now() > user.emailChangeOtpExpiry) {
            return res.status(HttpStatus.BAD_REQUEST).json({ message: 'OTP has expired' });
        }

        // Update user's email
        user.email = email;
        user.emailChangeOtp = undefined;
        user.emailChangeOtpExpiry = undefined;
        user.newEmail = undefined;
        
        await user.save();

        res.status(HttpStatus.OK).json({ 
            message: 'Email updated successfully',
            email: user.email
        });
    } catch (error) {
        console.error('Error verifying email change OTP:', error);
        res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ message: 'Failed to verify OTP' });
    }
};

export const resendEmailChangeOtp = async (req, res) => {
    try {
        const { email } = req.body;
        const userId = req.user._id;

        // Generate a new 6-digit OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        
        // Update OTP in database with new expiry (10 minutes)
        await User.findByIdAndUpdate(userId, {
            emailChangeOtp: otp,
            emailChangeOtpExpiry: Date.now() + 10 * 60 * 1000, // 10 minutes
            newEmail: email
        });

        // Send OTP to the new email address
        // Implement your email sending logic here
        
        // For development, you can console log the OTP
        console.log(`New OTP for email change: ${otp}`);

        res.status(HttpStatus.OK).json({ message: 'OTP resent to your new email address' });
    } catch (error) {
        console.error('Error resending email change OTP:', error);
        res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ message: 'Failed to resend OTP' });
    }
};

export {
    createUser,
    loginUser,
    logoutCurrentUser,
    getCurrentUserProfile,
    updateCurrentUserProfile,
    googleLogin,
    checkEmail,
    resetPassword,
};
