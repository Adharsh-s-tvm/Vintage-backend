import mongoose from "mongoose";

const variantSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    size: {
      type: String,
      required: true,
    },
    color: {
      type: String,
      required: true,
    },
    stock: {
      type: Number,
      required: true,
    },
    price: {
      type: Number,
      required: true,
    },
    discountPrice: {
      type: Number,
      default: null
    },
    activeOffer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Offer',
      default: null
    },
    isBlocked: {  
      type: Boolean,
      default: false,
    },
    mainImage: {
      type: String,
      required: false,
    },
    subImages: [{
      type: String,
      required: false,
    }],
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

const Variant = mongoose.model("Variant", variantSchema);

export default Variant;
