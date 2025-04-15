import mongoose from "mongoose";

const cartItemSchema = new mongoose.Schema({
    variant: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Variant',
        required: true
    },
    quantity: {
        type: Number,
        required: true,
        min: 1
    },
    price: {
        type: Number,//REMOVE
        required: true
    },
    totalPrice: {
        type: Number,
        required: true
    }
});

const cartSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    items: [cartItemSchema],
    subtotal: {
        type: Number,
        default: 0
    },
    shipping: {
        type: Number,
        default: 10 // Default shipping cost
    },
    total: {
        type: Number,
        default: 0
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
}, { timestamps: true });

// Calculate totals before saving
cartSchema.pre('save', function (next) {
    // Calculate subtotal
    this.subtotal = this.items.reduce((sum, item) => sum + item.totalPrice, 0);



    // Set shipping to 0 if subtotal is over 500
    this.shipping = this.subtotal > 500 ? 0 : 10;

    // Calculate total
    this.total = this.subtotal + this.shipping;

    next();
});

const Cart = mongoose.model('Cart', cartSchema);

export default Cart;
