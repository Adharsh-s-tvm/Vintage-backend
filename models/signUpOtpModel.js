import mongoose from "mongoose";

const otpSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true, // Ensure each email has only one active OTP entry
    },
    otp: {
      type: String,
      required: true,
    },
    otpExpires: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true }
);

// Prevent overwriting the model if it's already defined
const Otp = mongoose.models.Otp || mongoose.model("Otp", otpSchema);

export default Otp;
