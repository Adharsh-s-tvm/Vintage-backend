import Coupon from '../../models/product/couponModel.js';
import { HttpStatus } from '../../utils/httpStatus.js';

export const getAvailableCoupons = async (req, res) => {
  
    console.log("function called coupon 1");
    

  try {
    console.log("function called coupon 2");
    
    const currentDate = new Date();
    const coupons = await Coupon.find({
      startDate: { $lte: currentDate },
      endDate: { $gte: currentDate },
      isExpired: false,
      usedBy: { $nin: [req.user._id] }
    });
    console.log( "coupons" , coupons);
    

    res.json(coupons);
  } catch (error) {
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ message: error.message });
  }
};

export const applyCoupon = async (req, res) => {
  try {
    const { couponCode, cartTotal } = req.body;
    
    const coupon = await Coupon.findOne({ 
      couponCode,
      startDate: { $lte: new Date() },
      endDate: { $gte: new Date() },
      isExpired: false,
      usedBy: { $nin: [req.user._id] }
    });

    if (!coupon) {
      return res.status(HttpStatus.NOT_FOUND).json({ message: 'Invalid or expired coupon' });
    }

    if (cartTotal < coupon.minOrderAmount) {
      return res.status(HttpStatus.BAD_REQUEST).json({ 
        message: `Minimum order amount of ₹${coupon.minOrderAmount} required`
      });
    }

    let discountAmount;
    if (coupon.discountType === 'percentage') {
      discountAmount = (cartTotal * coupon.discountValue) / 100;
    } else {
      discountAmount = coupon.discountValue;
    }

    res.json({
      discountAmount,
      couponDetails: coupon
    });
  } catch (error) {
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ message: error.message });
  }
};

export const calculateFinalPrice = async (req, res) => {
  try {
    const { couponCode, cartItems } = req.body;
    
    // First calculate original prices and existing discounts
    let finalItems = cartItems.map(item => ({
      ...item,
      originalTotal: item.variant.price * item.quantity,
      currentDiscountPrice: item.variant.discountPrice || item.variant.price,
      finalPrice: (item.variant.discountPrice || item.variant.price) * item.quantity
    }));

    // Calculate subtotal after existing discounts
    const subtotal = finalItems.reduce((sum, item) => sum + item.finalPrice, 0);

    // If coupon exists, apply additional discount
    if (couponCode) {
      const coupon = await Coupon.findOne({
        couponCode,
        startDate: { $lte: new Date() },
        endDate: { $gte: new Date() },
        isExpired: false,
        usedBy: { $nin: [req.user._id] }
      });

      if (coupon && subtotal >= coupon.minOrderAmount) {
        const couponDiscount = coupon.discountType === 'percentage' 
          ? (subtotal * coupon.discountValue) / 100
          : coupon.discountValue;

        // Distribute coupon discount proportionally across items
        finalItems = finalItems.map(item => {
          const itemDiscountShare = (item.finalPrice / subtotal) * couponDiscount;
          const newFinalPrice = item.finalPrice - itemDiscountShare;
          const newUnitPrice = newFinalPrice / item.quantity;

          return {
            ...item,
            discountPrice: newUnitPrice,
            finalPrice: newFinalPrice,
            totalDiscount: item.originalTotal - newFinalPrice
          };
        });
      }
    }

    res.json({
      items: finalItems,
      totalDiscount: finalItems.reduce((sum, item) => 
        sum + (item.originalTotal - item.finalPrice), 0)
    });
  } catch (error) {
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ message: error.message });
  }
};