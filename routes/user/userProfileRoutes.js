import express from "express";
import { authenticate } from "../../middlewares/authMiddleware.js";
import {
    getUserDetails,
    updateUserDetails,
    getUserAddresses,
    addUserAddress,
    updateUserAddress,
    deleteUserAddress,
    uploadProfileImage,
    changePassword,
    updateUserEmail
} from '../../controllers/user/userProfileController.js';
import { upload } from '../../middlewares/multer.js';
import { getWalletDetails } from "../../controllers/user/userWalletController.js";

const router = express.Router();

// User details routes
router.get("/details", authenticate, getUserDetails);
router.put("/details", authenticate, updateUserDetails);

// Address routes
// Ensure authenticate middleware is applied to all routes
router.use(authenticate);

router.get("/address", getUserAddresses);
router.post("/address", addUserAddress);
router.put("/address/:id", authenticate, updateUserAddress);
router.delete("/address/:id", authenticate, deleteUserAddress);

// Image upload route
router.post('/upload-image', authenticate, upload.single('image'), uploadProfileImage);

// Add the change password route
router.put("/change-password", authenticate, changePassword);

// Add this route to your existing userRoutes.js file
router.put('/profile/update-email', authenticate, updateUserEmail);


router.get('/wallet', authenticate, getWalletDetails);



export default router;


