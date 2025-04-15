import mongoose from "mongoose";

const orderSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        orderId: {
            type: String,
            required: true,
            unique: true,
        },
        items: [
            {
                product: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: "Product",
                    required: true,
                },
                sizeVariant: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: "Variant",
                    required: true,
                },
                quantity: {
                    type: Number,
                    required: true,
                    min: 1,
                },
                price: {
                    type: Number,
                    required: true,
                    min: 0,
                },
                discountPrice: {
                    type: Number,
                    required: true,
                    min: 0,
                    default: function() {
                        return this.price;
                    }
                },
                finalPrice: {
                    type: Number,
                    required: true,
                    min: 0,
                },
                savedAmount: {
                    type: Number,
                    required: true,
                    min: 0,
                    default: function() {
                        return this.price - this.discountPrice;
                    }
                },
                status: {
                    type: String,
                    default: "pending",
                    enum: ["pending", "Processing", "Shipped", "Delivered", "Cancelled", "Returned"],
                },          
                cancellationReason: {
                    type: String,
                },
                returnRequested: {
                    type: Boolean,
                    default: false,
                },
                returnProcessed: {
                    type: Boolean,
                    default: false,
                },
                returnReason: {
                    type: String,
                    enum: [
                        "Defective",
                        "Not as described",
                        "Wrong size/fit",
                        "Changed my mind",
                        "Other"
                    ],
                },
                returnStatus: {
                    type: String,
                    default: "Return Pending",
                    enum: ["Return Pending", "Return Approved", "Return Rejected", "Refunded"],
                },
                rejectionReason: {
                    type: String,
                },
            },
        ],
        shipping: {
            address: {
                fullName: {
                    type: String,
                    required: true,
                },
                phone: {
                    type: String,
                    required: true,
                },
                street: {
                    type: String,
                    required: true,
                },
                city: {
                    type: String,
                    required: true,
                },
                state: {
                    type: String,
                    required: true,
                },
                country: {
                    type: String,
                    required: true,
                },
                postalCode: {
                    type: String,
                    required: true,
                }
            },
            shippingMethod: {
                type: String,
                required: true,
                enum: ["Standard", "Express"],
            },
            deliveryCharge: {
                type: Number,
                default: 0,
                min: 0,
            },
        },
        payment: {
            method: {
                type: String,
                required: true,
                enum: ["cod", "online", "wallet"]
            },
            status: {
                type: String,
                required: true,
                enum: ["pending", "initiated", "completed", "failed", "cancelled", "retry_pending"],
                default: "pending"
            },
            transactionId: {
                type: String,
                required: true,
            },
            amount: {
                type: Number,
                required: true,
            },
            paymentDate: {
                type: Date,
                default: Date.now,
            },
        },
        orderStatus: {
            type: String,
            required: true,
            default: "pending",
            enum: ["pending", "Processing", "Shiped", "Delivered", "Cancelled"],
        },
        reason: {
            type: String,
        },
        totalAmount: {
            type: Number,
            required: true,
        },
        couponCode: {
            type: String,
        },
        discountAmount: {
            type: Number,
            default: 0,
        },
    },
    {
        timestamps: true,
    }
);

const Order = mongoose.model("Order", orderSchema);

export default Order;