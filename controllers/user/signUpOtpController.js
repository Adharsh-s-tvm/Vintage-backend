import asyncHandler from "../../middlewares/asyncHandler.js";
import OTP from "../../models/signUpOtpModel.js";
import nodemailer from "nodemailer";
import { HttpStatus } from "../../utils/httpStatus.js";

// Generate OTP
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Send OTP Email

export const sendEmailOTP = async (email, otpCode) => {
  try {
    console.log("Generated OTP:", otpCode); // Debugging to check OTP value

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER, // Your Gmail
        pass: process.env.EMAIL_PASS, // App password (not regular password)
      },
    });

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Your OTP Code",
      text: `Your OTP code is: ${otpCode}. It will expire in 5 minutes.`,
    };

    await transporter.sendMail(mailOptions);
    console.log(`OTP email sent to ${email}`);
  } catch (error) {
    console.error("Error sending email:", error);
    throw new Error("Failed to send OTP email");
  }
};


// Controller to handle OTP request
export const sendOTP = asyncHandler(async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(HttpStatus.BAD_REQUEST).json({ message: "Email is required" });
  }

  // Generate a random 6-digit OTP as a string
  const otpCode = `${Math.floor(100000 + Math.random() * 900000)}`;

  // Set OTP expiration time (e.g., 5 minutes)
  const otpExpiry = new Date(Date.now() + 5 * 60 * 1000); // Add 5 minutes


  try {
    // Save or update OTP in MongoDB
    const otpData = await OTP.findOneAndUpdate(
      { email }, 
      { otp: otpCode, expiresAt: otpExpiry }, 
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    console.log(`✅ OTP stored in DB for ${email}:`, otpData);

    // Confirm OTP has been saved
    const savedOTP = await OTP.findOne({ email });
    if (!savedOTP) {
      console.log("❌ OTP NOT SAVED in MongoDB.");
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ message: "Failed to save OTP. Please try again." });
    }

    // Send OTP via email
    await sendEmailOTP(email, otpCode);  // Ensure this function is working correctly

    res.status(HttpStatus.OK).json({ message: "OTP sent successfully", otpCode });
  } catch (error) {
    console.error("❌ Error saving OTP:", error);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ message: "Internal server error" });
  }
});





export const verifyOTP = async (req, res) => {
  console.log("called b verigy");
  
  try {
    const { email, otp } = req.body;
    console.log(req.body);
    
    if ( !otp) return res.status(HttpStatus.BAD_REQUEST).json({ message: "OTP is required" });

    console.log(`🔍 Verifying OTP for ${email}: Received OTP - ${otp}`);

    // Find the OTP by email only
    const otpRecord = await OTP.findOne({ email });

    if (!otpRecord) {
      console.log("❌ No OTP record found for this email.");
      return res.status(HttpStatus.BAD_REQUEST).json({ message: "Invalid OTP" });
    }

    console.log(`✅ Stored OTP for ${email}: ${otpRecord.otp}`);

    // Ensure OTP matches (convert both to strings to prevent type mismatches)
    if (String(otpRecord.otp).trim() !== String(otp).trim()) {
      console.log("❌ OTP mismatch! Received:", otp, "Stored:", otpRecord.otp);
      return res.status(HttpStatus.BAD_REQUEST).json({ message: "Invalid OTP" });
    }

    // Check if OTP is expired
    if (otpRecord.expiresAt < new Date()) {
      console.log("❌ OTP expired!");
      return res.status(HttpStatus.BAD_REQUEST).json({ message: "OTP expired" });
    }

    // OTP is valid - delete from DB
    await OTP.deleteOne({ email });

    res.status(HttpStatus.OK).json({ message: "OTP verified successfully", success : true });
  } catch (error) {
    console.error("❌ Error in verifyOTP:", error);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ message: "Error verifying OTP", error: error.message });
  }
};



export const resSendOTP = asyncHandler(async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(HttpStatus.BAD_REQUEST).json({ message: "Email is required" });
  }

  // Generate a random 6-digit OTP as a string
  const otpCode = `${Math.floor(100000 + Math.random() * 900000)}`;

  // Set OTP expiration time (e.g., 5 minutes)
  const otpExpiry = new Date(Date.now() + 5 * 60 * 1000); // Add 5 minutes


  try {
    // Save or update OTP in MongoDB
    const otpData = await OTP.findOneAndUpdate(
      { email }, 
      { otp: otpCode, expiresAt: otpExpiry }, 
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    console.log(`✅ OTP stored in DB for ${email}:`, otpData);

    // Confirm OTP has been saved
    const savedOTP = await OTP.findOne({ email });
    if (!savedOTP) {
      console.log("❌ OTP NOT SAVED in MongoDB.");
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ message: "Failed to save OTP. Please try again." });
    }

    // Send OTP via email
    await sendEmailOTP(email, otpCode);  // Ensure this function is working correctly

    res.status(HttpStatus.OK).json({ message: "OTP sent successfully", otpCode });
  } catch (error) {
    console.error("❌ Error saving OTP:", error);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ message: "Internal server error" });
  }
});