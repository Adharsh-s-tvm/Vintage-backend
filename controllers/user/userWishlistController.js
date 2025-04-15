import asyncHandler from 'express-async-handler';
import Wishlist from '../../models/product/wishlistModel.js';
import Product from '../../models/product/productModel.js'
import Variant from '../../models/product/sizeVariantModel.js';
import { HttpStatus } from '../../utils/httpStatus.js';


const getWishlist = asyncHandler(async (req, res) => {
    let wishlist = await Wishlist.findOne({ user: req.user._id })
        .populate({
            path: 'items.product',
            populate: [
                { path: 'brand', select: 'name' },
                { path: 'category', select: 'name' }
            ]
        })
        .populate('items.variant');

    if (!wishlist) {
        wishlist = await Wishlist.create({
            user: req.user._id,
            items: []
        });
    }

    res.json(wishlist.items);
});


const addToWishlist = asyncHandler(async (req, res) => {
    const { productId, variantId } = req.body;

    if (!productId || !variantId) {
        res.status(HttpStatus.BAD_REQUEST);
        throw new Error('Product ID and Variant ID are required');
    }

    // Find the variant and check if it exists
    const variant = await Variant.findById(variantId);
    if (!variant) {
        res.status(HttpStatus.NOT_FOUND);
        throw new Error('Variant not found');
    }

    // Find or create wishlist
    let wishlist = await Wishlist.findOne({ user: req.user._id });
    if (!wishlist) {
        wishlist = await Wishlist.create({
            user: req.user._id,
            items: []
        });
    }

    // Check if the variant is already in the wishlist
    const existingItem = wishlist.items.find(
        item => item.variant.toString() === variantId
    );

    if (existingItem) {
        res.status(HttpStatus.BAD_REQUEST);
        throw new Error('This item is already in your wishlist');
    }

    // If not in wishlist, add it
    wishlist.items.push({ product: productId, variant: variantId });
    await wishlist.save();

    // Get the populated wishlist item to return
    const populatedWishlist = await Wishlist.findById(wishlist._id)
        .populate({
            path: 'items.product',
            populate: [
                { path: 'brand', select: 'name' },
                { path: 'category', select: 'name' }
            ]
        })
        .populate('items.variant');

    const addedItem = populatedWishlist.items[populatedWishlist.items.length - 1];
    res.status(HttpStatus.OK).json(addedItem);
});


const removeFromWishlist = asyncHandler(async (req, res) => {
    const variantId = req.params.variantId;

    if (!variantId) {
        res.status(HttpStatus.BAD_REQUEST);
        throw new Error('Variant ID is required');
    }

    // Find the wishlist for the user
    let wishlist = await Wishlist.findOne({ user: req.user._id });

    if (!wishlist) {
        res.status(HttpStatus.NOT_FOUND);
        throw new Error('Wishlist not found');
    }

    // Update the wishlist using MongoDB's pull operator and populate all necessary fields
    wishlist = await Wishlist.findOneAndUpdate(
        { user: req.user._id },
        { $pull: { items: { variant: variantId } } },
        { 
            new: true,
            populate: {
                path: 'items',
                populate: [
                    {
                        path: 'product',
                        populate: [
                            { path: 'brand', select: 'name' },
                            { path: 'category', select: 'name' }
                        ]
                    },
                    {
                        path: 'variant',
                        select: 'size color price stock mainImage'
                    }
                ]
            }
        }
    );

    if (!wishlist) {
        res.status(HttpStatus.NOT_FOUND);
        throw new Error('Failed to update wishlist');
    }

    res.status(HttpStatus.OK).json({
        success: true,
        message: 'Item removed from wishlist',
        items: wishlist.items
    });
});

export { getWishlist, addToWishlist, removeFromWishlist };
