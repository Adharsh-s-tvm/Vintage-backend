import jwt from "jsonwebtoken";
import User from "../models/userModel.js";
import Admin from "../models/adminModel.js";
import asyncHandler from "./asyncHandler.js";
import { HttpStatus } from "../utils/httpStatus.js";

const authenticate = asyncHandler(async (req, res, next) => {
  let token;

  // Check Authorization header
  if (req.headers.authorization?.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }
  // Check cookies if no token in header
  if (!token) {
    token = req.cookies.jwt || req.cookies.token;
  }

  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = await User.findById(decoded.userId).select("-password");
      next();
    } catch (error) {
      console.error('Auth error:', error);
      res.status(HttpStatus.UNAUTHORIZED).json({ message: "Not authorized, token failed" });
    }
  } else {
    res.status(HttpStatus.UNAUTHORIZED).json({ message: "Please login" });
  }
});

const authorizeAdmin = asyncHandler(async (req, res, next) => {
  let token = req.cookies.token;

  if (!token) {
    res.status(HttpStatus.UNAUTHORIZED);
    throw new Error("Not authorized, no token");
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const admin = await Admin.findById(decoded.id).select("-password");

    if (!admin || !admin.isAdmin) {
      res.status(HttpStatus.UNAUTHORIZED);
      throw new Error("Not authorized as admin");
    }

    req.admin = admin;
    next();
  } catch (error) {
    res.status(HttpStatus.UNAUTHORIZED);
    throw new Error("Not authorized, token failed");
  }
});

export { authenticate, authorizeAdmin };
