import Coupon from '../../models/product/couponModel.js';
import { HttpStatus } from '../../utils/httpStatus.js';

export const addCoupon = async (req, res) => {
  try {
    const { couponCode, discountType, discountValue, startDate, endDate, minOrderAmount } = req.body;

    // Validate required fields and check for empty spaces
    if (!couponCode?.trim() || !discountType || !discountValue || !startDate || !endDate || !minOrderAmount) {
      return res.status(HttpStatus.BAD_REQUEST).json({ message: 'All fields are required' });
    }

    if (discountType === 'percentage' && discountValue > 100) {
      return res.status(HttpStatus.BAD_REQUEST).json({ message: 'Discount value must be less than 100 for percentage discount' });
    }

    // Validate coupon code format
    if (couponCode.trim().length < 3) {
      return res.status(HttpStatus.BAD_REQUEST).json({ message: 'Coupon code must be at least 3 characters long' });
    }

    if (discountValue >= minOrderAmount) {
      return res.status(HttpStatus.BAD_REQUEST).json({ message: 'Discount value must be less than minimum order amount' });
    }

    // Check if coupon code already exists (case insensitive)
    const existingCoupon = await Coupon.findOne({
      couponCode: { $regex: new RegExp(`^${couponCode.trim()}$`, 'i') }
    });

    if (existingCoupon) {
      return res.status(HttpStatus.BAD_REQUEST).json({ message: 'Coupon code already exists' });
    }

    // Create new coupon with trimmed code
    const coupon = new Coupon({
      couponCode: couponCode.trim().toUpperCase(),
      discountType,
      discountValue,
      startDate,
      endDate,
      minOrderAmount
    });

    await coupon.save();
    res.status(HttpStatus.CREATED).json(coupon);
  } catch (error) {
    res.status(HttpStatus.BAD_REQUEST).json({ message: error.message });
  }
};

export const getAllCoupons = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 5;
    const search = req.query.search || '';
    const filter = req.query.filter || 'all';

    const currentDate = new Date(); // Get the current date and time
    await Coupon.updateMany(
      {
        endDate: { $lt: currentDate },
        isExpired: false,
      },
      {
        $set: {
          isExpired: true,
        },
      }
    );

    // Build filter query
    let filterQuery = {};

    // Add search conditions if search query exists
    if (search) {
      filterQuery.$or = [
        { couponCode: { $regex: search, $options: 'i' } },
        { discountType: { $regex: search, $options: 'i' } },
        { discountValue: { $regex: search, $options: 'i' } }
      ];
    }

    // Add status filter if not 'all'
    if (filter !== 'all') {
      filterQuery.isExpired = filter === 'expired';
    }

    // Get total count for pagination
    const total = await Coupon.countDocuments(filterQuery);

    // Fetch coupons with filters and pagination
    const coupons = await Coupon.find(filterQuery)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    res.json({
      coupons,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalCoupons: total,
        hasNextPage: page * limit < total,
        hasPrevPage: page > 1,
        limit
      }
    });
  } catch (error) {
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      message: "Failed to fetch coupons",
      error: error.message
    });
  }
};

export const updateCoupon = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Validate coupon code if it's being updated
    if (updateData.couponCode) {
      if (!updateData.couponCode.trim()) {
        return res.status(HttpStatus.BAD_REQUEST).json({ message: 'Coupon code cannot be empty' });
      }

      if (updateData.couponCode.trim().length < 3) {
        return res.status(HttpStatus.BAD_REQUEST).json({ message: 'Coupon code must be at least 3 characters long' });
      }

      // Check if the new code already exists (excluding current coupon)
      const existingCoupon = await Coupon.findOne({
        couponCode: { $regex: new RegExp(`^${updateData.couponCode.trim()}$`, 'i') },
        _id: { $ne: id }
      });

      if (existingCoupon) {
        return res.status(HttpStatus.BAD_REQUEST).json({ message: 'Coupon code already exists' });
      }

      // Trim and uppercase the coupon code
      updateData.couponCode = updateData.couponCode.trim().toUpperCase();
    }

    // Validate discount value if both discount value and min order amount are present
    if (updateData.discountValue && updateData.minOrderAmount) {
      if (updateData.discountValue >= updateData.minOrderAmount) {
        return res.status(HttpStatus.BAD_REQUEST).json({ message: 'Discount value must be less than minimum order amount' });
      }
    }

    const coupon = await Coupon.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!coupon) {
      return res.status(HttpStatus.NOT_FOUND).json({ message: 'Coupon not found' });
    }

    res.status(HttpStatus.OK).json(coupon);
  } catch (error) {
    res.status(HttpStatus.BAD_REQUEST).json({ message: error.message });
  }
};

export const toggleCouponStatus = async (req, res) => {
  try {
    const { id } = req.params;

    const coupon = await Coupon.findById(id);
    if (!coupon) {
      return res.status(HttpStatus.NOT_FOUND).json({ message: 'Coupon not found' });
    }

    coupon.isExpired = !coupon.isExpired;
    await coupon.save();

    res.status(HttpStatus.OK).json(coupon);
  } catch (error) {
    res.status(HttpStatus.BAD_REQUEST).json({ message: error.message });
  }
};
