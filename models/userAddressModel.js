import mongoose from "mongoose";

const addressSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User", // Reference to the User model
      required: true,
    },
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
    },
    isDefault: {
      type: Boolean,
      default: false, // Indicates if this is the user's default address
    },
  },
  { timestamps: true }
);

// Prevent overwriting the model if it's already defined
const Address = mongoose.models.Address || mongoose.model("Address", addressSchema);

export default Address;
