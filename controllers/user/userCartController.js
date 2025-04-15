import Cart from "../../models/product/cartModel.js";
import Product from "../../models/product/productModel.js";
import Variant from "../../models/product/sizeVariantModel.js";
import Wishlist from "../../models/product/wishlistModel.js"; // Add this import
import { HttpStatus } from "../../utils/httpStatus.js";

const MAX_QUANTITY_PER_ITEM = 5; // Add this constant at the top of the file

// Add to cart
export const addToCart = async (req, res) => {
    try {
        const { variantId, quantity, removeFromWishlist } = req.body; // Add removeFromWishlist parameter
        const userId = req.user._id;

        // Check maximum quantity
        if (quantity > MAX_QUANTITY_PER_ITEM) {
            return res.status(HttpStatus.BAD_REQUEST).json({ 
                message: `Maximum ${MAX_QUANTITY_PER_ITEM} items allowed per product` 
            });
        }

        // Check if variant exists and is not blocked
        const variant = await Variant.findById(variantId).populate({
            path: 'product',
            populate: ['category', 'brand']
        });

        if (!variant) {
            return res.status(HttpStatus.NOT_FOUND).json({ message: "Variant not found" });
        }

        // Check if variant or product is blocked/unlisted
        if (
            variant.isBlocked ||
            variant.product.isBlocked ||
            !variant.product.isListed ||
            variant.product.category.isBlocked ||
            variant.product.brand.isBlocked
        ) {
            return res.status(HttpStatus.BAD_REQUEST).json({ message: "Product is not available" });
        }

        // Check stock
        if (variant.stock < quantity) {
            return res.status(HttpStatus.BAD_REQUEST).json({ message: "Insufficient stock" });
        }

        // Find or create cart
        let cart = await Cart.findOne({ user: userId });
        if (!cart) {
            cart = new Cart({ user: userId, items: [] });
        }

        // Check if variant already in cart
        const existingItem = cart.items.find(item =>
            item.variant.toString() === variantId
        );

        if (existingItem) {
            // Check if new total quantity exceeds maximum limit
            const newQuantity = existingItem.quantity + quantity;
            if (newQuantity > MAX_QUANTITY_PER_ITEM) {
                return res.status(HttpStatus.BAD_REQUEST).json({ 
                    message: `Cannot add more than ${MAX_QUANTITY_PER_ITEM} items of the same product` 
                });
            }
            // Check if new total quantity exceeds stock
            if (newQuantity > variant.stock) {
                return res.status(HttpStatus.BAD_REQUEST).json({ message: "Insufficient stock" });
            }
            existingItem.quantity = newQuantity;
            existingItem.totalPrice = existingItem.price * existingItem.quantity;
        } else {
            // Add new item with price and total price
            cart.items.push({
                variant: variantId,
                quantity,
                price: variant.price,
                totalPrice: variant.price * quantity
            });
        }

        await cart.save();

        // Remove from wishlist if requested
        if (removeFromWishlist) {
            await Wishlist.updateOne(
                { user: userId },
                { $pull: { items: { variant: variantId } } }
            );
        }

        // Populate cart details
        const populatedCart = await Cart.findById(cart._id)
            .populate({
                path: 'items.variant',
                populate: {
                    path: 'product',
                    populate: ['category', 'brand']
                }
            });

        // Get updated wishlist if it was modified
        let updatedWishlist = null;
        if (removeFromWishlist) {
            updatedWishlist = await Wishlist.findOne({ user: userId })
                .populate({
                    path: 'items.product',
                    populate: [
                        { path: 'brand', select: 'name' },
                        { path: 'category', select: 'name' }
                    ]
                })
                .populate('items.variant');
        }

        res.status(HttpStatus.OK).json({
            cart: populatedCart,
            wishlist: removeFromWishlist ? updatedWishlist?.items || [] : undefined
        });
    } catch (error) {
        console.error('Error adding to cart:', error);
        res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ message: "Error adding to cart" });
    }
};

// Get cart
export const getCart = async (req, res) => {
    try {
        const userId = req.user._id;

        const cart = await Cart.findOne({ user: userId })
            .populate({
                path: 'items.variant',
                populate: {
                    path: 'product',
                    populate: ['category', 'brand']
                }
            });

        if (!cart) {
            return res.status(HttpStatus.OK).json({
                items: [],
                subtotal: 0,
                tax: 0,
                shipping: 0,
                total: 0
            });
        }

        // Filter out any blocked/unlisted items
        cart.items = cart.items.filter(item => {
            const variant = item.variant;
            const product = variant.product;
            return !(
                variant.isBlocked ||
                product.isBlocked ||
                !product.isListed ||
                product.category.isBlocked ||
                product.brand.isBlocked
            );
        });

        await cart.save();
        res.status(HttpStatus.OK).json(cart);
    } catch (error) {
        console.error('Error fetching cart:', error);
        res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ message: "Error fetching cart" });
    }
};

// Update cart item quantity
export const updateCartItem = async (req, res) => {
    try {
        const { variantId, quantity } = req.body;
        const userId = req.user._id;

        if (quantity < 1 || quantity > MAX_QUANTITY_PER_ITEM) {
            return res.status(HttpStatus.BAD_REQUEST).json({ 
                message: `Quantity must be between 1 and ${MAX_QUANTITY_PER_ITEM}` 
            });
        }

        // First find the cart and populate variant details
        const cart = await Cart.findOne({ user: userId })
            .populate({
                path: 'items.variant',
                populate: {
                    path: 'product',
                    populate: ['category', 'brand']
                }
            });

        if (!cart) {
            return res.status(HttpStatus.NOT_FOUND).json({ message: "Cart not found" });
        }

        const cartItem = cart.items.find(item =>
            item.variant._id.toString() === variantId
        );

        if (!cartItem) {
            return res.status(HttpStatus.NOT_FOUND).json({ message: "Item not found in cart" });
        }

        // Check stock
        if (cartItem.variant.stock < quantity) {
            return res.status(HttpStatus.BAD_REQUEST).json({ message: "Insufficient stock" });
        }

        cartItem.quantity = quantity;
        cartItem.totalPrice = cartItem.price * quantity;
        await cart.save();

        const updatedCart = await Cart.findById(cart._id)
            .populate({
                path: 'items.variant',
                populate: {
                    path: 'product',
                    populate: ['category', 'brand']
                }
            });

        res.status(HttpStatus.OK).json(updatedCart);
    } catch (error) {
        console.error('Error updating cart item:', error);
        res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ message: "Error updating cart item" });
    }
};

// Remove item from cart
export const removeFromCart = async (req, res) => {
    try {
        const { variantId } = req.params;
        const userId = req.user._id;

        const cart = await Cart.findOne({ user: userId });
        if (!cart) {
            return res.status(HttpStatus.NOT_FOUND).json({ message: "Cart not found" });
        }

        cart.items = cart.items.filter(item =>
            item.variant.toString() !== variantId
        );

        await cart.save();

        const updatedCart = await Cart.findById(cart._id)
            .populate({
                path: 'items.variant',
                populate: {
                    path: 'product',
                    populate: ['category', 'brand']
                }
            });

        res.status(HttpStatus.OK).json(updatedCart);
    } catch (error) {
        console.error('Error removing from cart:', error);
        res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ message: "Error removing from cart" });
    }
};
