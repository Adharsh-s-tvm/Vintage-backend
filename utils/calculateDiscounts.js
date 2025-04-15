import Offer from '../models/product/offerModel.js';
import Product from '../models/product/productModel.js';
import Variant from '../models/product/sizeVariantModel.js';

export const calculateAndUpdateDiscounts = async () => {
  try {
    // Get all active offers sorted by creation date (newest first)
    const activeOffers = await Offer.find({
      isActive: true,
      startDate: { $lte: new Date() },
      endDate: { $gte: new Date() }
    }).sort({ createdAt: -1 });

    // Create a map to track which variants have been processed
    const processedVariants = new Set();

    // Process each active offer
    for (const offer of activeOffers) {
      if (offer.offerType === "product") {
        // Handle product-specific offers
        for (const productId of offer.items) {
          const variants = await Variant.find({ product: productId });
          for (const variant of variants) {
            if (!processedVariants.has(variant._id.toString())) {
              const discountAmount = (variant.price * offer.discountPercentage) / 100;
              const discountedPrice = Math.round(variant.price - discountAmount);
              await Variant.findByIdAndUpdate(
                variant._id,
                { 
                  discountPrice: discountedPrice,
                  activeOffer: offer._id // Track which offer is applied
                }
              );
              processedVariants.add(variant._id.toString());
            }
          }
        }
      } else if (offer.offerType === "category") {
        // Handle category-wide offers
        for (const categoryId of offer.items) {
          const products = await Product.find({ category: categoryId });
          for (const product of products) {
            const variants = await Variant.find({ product: product._id });
            for (const variant of variants) {
              if (!processedVariants.has(variant._id.toString())) {
                const discountAmount = (variant.price * offer.discountPercentage) / 100;
                const discountedPrice = Math.round(variant.price - discountAmount);
                await Variant.findByIdAndUpdate(
                  variant._id,
                  { 
                    discountPrice: discountedPrice,
                    activeOffer: offer._id
                  }
                );
                processedVariants.add(variant._id.toString());
              }
            }
          }
        }
      }
    }

    // Reset discount prices for variants not processed
    await Variant.updateMany(
      { _id: { $nin: Array.from(processedVariants) } },
      { $unset: { discountPrice: "", activeOffer: "" } }
    );
  } catch (error) {
    console.error('Error calculating discounts:', error);
    throw error;
  }
}; 