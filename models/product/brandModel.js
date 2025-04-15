import mongoose from "mongoose";

const brandSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, "brand name is required"],
        },
        status: {
            type: String,
            enum: ['listed', 'Not listed'],
            default: 'listed'
        },
        category: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Category",
        },
        createdAt: {
            type: Date,
            default: Date.now,
        },
    },
    { timestamps: true }
);

const Brand = mongoose.model("Brand", brandSchema);

export default Brand;
