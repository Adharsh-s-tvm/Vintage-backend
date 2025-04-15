import Offer from '../../models/product/offerModel.js';
import Variant from '../../models/product/sizeVariantModel.js';
import Product from '../../models/product/productModel.js';
import { calculateAndUpdateDiscounts } from '../../utils/calculateDiscounts.js';
import Category from '../../models/product/categoryModel.js';
import { HttpStatus } from '../../utils/httpStatus.js';

const updateVariantPrices = async (offer) => {
  try {
    const { items, offerType, discountPercentage, isActive, startDate, endDate } = offer;
    
    // Check if offer is active and current date is within offer period
    const currentDate = new Date();
    const isValidPeriod = currentDate >= new Date(startDate) && currentDate <= new Date(endDate);
    
    if (!isActive || !isValidPeriod) {
      // Reset discount prices if offer is inactive or expired
      if (offerType === "product") {
        for (const productId of items) {
          await Variant.updateMany(
            { product: productId },
            { $unset: { discountPrice: "" } }
          );
        }
      } else if (offerType === "category") {
        for (const categoryId of items) {
          const products = await Product.find({ category: categoryId });
          for (const product of products) {
            await Variant.updateMany(
              { product: product._id },
              { $unset: { discountPrice: "" } }
            );
          }
        }
      }
      return;
    }

    // Update prices for active and valid offers
    if (offerType === "product") {
      for (const productId of items) {
        const variants = await Variant.find({ product: productId });
        for (const variant of variants) {
          const discountedPrice = Math.round(variant.price - (variant.price * discountPercentage / 100));
          variant.discountPrice = discountedPrice;
          await variant.save();
        }
      }
    } else if (offerType === "category") {
      for (const categoryId of items) {
        const products = await Product.find({ category: categoryId });
        for (const product of products) {
          const variants = await Variant.find({ product: product._id });
          for (const variant of variants) {
            const discountedPrice = Math.round(variant.price - (variant.price * discountPercentage / 100));
            variant.discountPrice = discountedPrice;
            await variant.save();
          }
        }
      }
    }
  } catch (error) {
    console.error('Error updating variant prices:', error);
    throw error;
  }
};

export const addOffer = async (req, res) => {
    console.log("offer fn called");
    
  try {
    const { offerName, offerType, discountPercentage, startDate, endDate, items } = req.body;

    // Validate required fields
    if (!offerName || !offerType || !discountPercentage || !startDate || !endDate || !items.length) {
      return res.status(HttpStatus.BAD_REQUEST).json({ message: 'All fields are required' });
    }

    if(startDate > endDate){
      return res.status(HttpStatus.BAD_REQUEST).json({ message: 'Start date cannot be greater than end date' });
    }

    if(discountPercentage > 100){
      return res.status(HttpStatus.BAD_REQUEST).json({ message: 'Discount percentage cannot be greater than 100' });
    }


    // Create new offer
    const offer = new Offer({
      offerName,
      offerType,
      discountPercentage,
      startDate,
      endDate,
      items
    });

    await offer.save();
    await updateVariantPrices(offer);

    res.status(HttpStatus.CREATED).json(offer);
  } catch (error) {
    res.status(HttpStatus.BAD_REQUEST).json({ message: error.message });
  }
};

export const getAllOffers = async (req, res) => {
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
        { offerName: { $regex: search, $options: 'i' } },
        { offerType: { $regex: search, $options: 'i' } },
        { discountPercentage: { $regex: search, $options: 'i' } }
      ];
    }

    // Add status filter if not 'all'
    if (filter !== 'all') {
      filterQuery.isActive = filter === 'active';
    }

    // Get total count for pagination
    const total = await Offer.countDocuments(filterQuery);

    // Fetch offers with filters and pagination
    const offers = await Offer.find(filterQuery)
      .populate('items', 'name')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    res.json({
      offers,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalOffers: total,
        hasNextPage: page * limit < total,
        hasPrevPage: page > 1,
        limit
      }
    });
  } catch (error) {
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ 
      message: "Failed to fetch offers",
      error: error.message 
    });
  }
};

export const updateOffer = async (req, res) => {
  try {
    const offer = await Offer.findByIdAndUpdate(req.params.id, req.body, { new: true });
    
    // Recalculate all discounts
    await calculateAndUpdateDiscounts();
    
    res.status(HttpStatus.OK).json(offer);
  } catch (error) {
    res.status(HttpStatus.BAD_REQUEST).json({ message: error.message });
  }
};

export const toggleOfferStatus = async (req, res) => {
  try {
    const offer = await Offer.findById(req.params.id);
    offer.isActive = !offer.isActive;
    await offer.save();
    
    // Recalculate all discounts
    await calculateAndUpdateDiscounts();
    
    res.status(HttpStatus.OK).json(offer);
  } catch (error) {
    res.status(HttpStatus.BAD_REQUEST).json({ message: error.message });
  }
};

export const fetchAllProductsForOffer = async (req, res) => {
  try {
    const products = await Product.find({ isBlocked: false })
      .select('name')
      .sort({ name: 1 });
    
    res.status(HttpStatus.OK).json({
      success: true,
      products
    });
  } catch (error) {
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ 
      success: false,
      message: "Failed to fetch products",
      error: error.message 
    });
  }
};

export const fetchAllCategoriesForOffer = async (req, res) => {
  try {
    const categories = await Category.find({ status: 'listed' })
      .select('name')
      .sort({ name: 1 });
    
    res.status(HttpStatus.OK).json({
      success: true,
      categories
    });
  } catch (error) {
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ 
      success: false,
      message: "Failed to fetch categories",
      error: error.message 
    });
  }
};
