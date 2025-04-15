import crypto from "crypto";
import Otp from "../models/Otp.js";

export const generateOTP = async (email) => {
  const otp = crypto.randomInt(100000, 999999).toString(); // Generates a 6-digit OTP
  const otpExpires = new Date(Date.now() + 1 * 60 * 1000); // 5-minute expiry

  // Check if an OTP already exists for this email
  let otpRecord = await Otp.findOne({ email });

  if (otpRecord) {
    otpRecord.otp = otp;
    otpRecord.otpExpires = otpExpires;
  } else {
    otpRecord = new Otp({ email, otp, otpExpires });
  }

  await otpRecord.save();
  return otp;
};
