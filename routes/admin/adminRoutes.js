import express from "express";
import { authenticate, authorizeAdmin } from '../../middlewares/authMiddleware.js'
import {
  loginAdmin,
  logoutCurrentAdmin,
  getAllUsers,
  deleteUserById,
  getUserById,
  updateUserById,
  getDashboard,
  updateUserStatus
} from "../../controllers/admin/adminController.js";
import { getSalesReport, downloadSalesReport } from '../../controllers/admin/salesController.js';

const router = express.Router();


router.post("/login", loginAdmin);
router.post("/logout",  logoutCurrentAdmin);
router.get("/dashboard", authenticate, authorizeAdmin, getDashboard);

router.get("/users", authenticate, authorizeAdmin, getAllUsers);

router
  .route("/users/:id")
  .delete(authenticate, authorizeAdmin, deleteUserById)
  .get(authenticate, authorizeAdmin, getUserById)
  .put(authenticate, authorizeAdmin, updateUserById);


router.put("/users/:id/status", authenticate, authorizeAdmin, updateUserStatus);

router.get('/sales-report', authenticate, authorizeAdmin, getSalesReport);
router.get('/sales-report/download', authenticate, authorizeAdmin, downloadSalesReport);

export default router;
