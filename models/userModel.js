import mongoose from "mongoose";

// Function to generate referral code
const generateReferralCode = () => {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 10; i++) {
    const randomIndex = Math.floor(Math.random() * characters.length);
    code += characters[randomIndex];
  }
  return code;
};

const userSchema = new mongoose.Schema({
    firstname: {
        type: String,
        required: true
    },
    lastname: {
        type: String,
        required: false,
        default: null
    },
    username: {
        type: String,
        required: false,
        unique: true,
        trim: true,
        // Generate username from firstname and lastname
        default: function () {
            return `${this.firstname.toLowerCase()}_${this.lastname.toLowerCase()}`;
        }
    },
    email: {
        type: String,
        required: true,
        unique: true
    },
    password: {
        type: String,
        required: true
    },
    image: {
        type: String,
        required: false
    },
    phone: {
        type: String,
        required: false,
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    isVerified: {
        type: Boolean,
        default: false
    },
    // isDeleted: {
    //     type: Boolean,
    //     default: false
    // },
    isAdmin: {
        type: Boolean,
        default: false
    },
    status: {
        type: String,
        enum: ["active", "banned"],
        default: "active"
    },
    referralCode: {
        type: String,
        unique: true,
        required: true,
        default: function() {
            return generateReferralCode();
        }
    },
},
    { timestamps: true }
);

// Pre-save middleware to ensure unique referral code
userSchema.pre('save', async function(next) {
    if (this.isNew) {
        let isUnique = false;
        let attempts = 0;
        const maxAttempts = 5;

        while (!isUnique && attempts < maxAttempts) {
            const referralCode = generateReferralCode();
            const existingUser = await this.constructor.findOne({ referralCode });
            
            if (!existingUser) {
                this.referralCode = referralCode;
                isUnique = true;
            }
            attempts++;
        }

        if (!isUnique) {
            throw new Error('Unable to generate unique referral code');
        }
    }
    next();
});

const User = mongoose.model("User", userSchema);

export default User;