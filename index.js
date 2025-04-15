//packages
import express from "express";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import cors from 'cors'
import morgan from "morgan";
import helmet from "helmet";
import http from 'http'
import { Server } from "socket.io";
import { initCouponExpirationCheck } from "./utils/cronJobs.js"

// Utiles 
import connectDB from './config/db.js'
import userRoutes from './routes/user/userRoutes.js'
import adminRoutes from "./routes/admin/adminRoutes.js";
import signUpOtpRoutes from './routes/user/signUpOtpRoutes.js'
import adminProductRoutes from './routes/admin/adminProductRoutes.js'
import userProductRoutes from './routes/user/userProductRoutes.js'
import userProfileRoutes from './routes/user/userProfileRoutes.js'
import userCartRoutes from './routes/user/userCartRoutes.js'
import { errorHandler } from "./middlewares/errorHandler.js";
import userWishlistRoutes from './routes/user/userWishlistRoutes.js';
import userOrderRoutes from './routes/user/userOrderRoutes.js';
import adminOrderRoutes from './routes/admin/adminOrderRoutes.js';
import paymentRoutes from './routes/user/paymentRoutes.js';
import adminOfferRoutes from './routes/admin/adminOfferRoutes.js'
import adminCouponRoutes from './routes/admin/adminCouponRoutes.js'
import userCouponRoutes from './routes/user/userCouponRoutes.js'
import adminWalletRoutes from './routes/admin/adminWalletRoutes.js'
import messageRoutes from './routes/messageRoutes.js'


dotenv.config()
const port = process.env.PORT || 7000;

connectDB()

const app = express()
app.use(cors({
    origin: process.env.FRONTEND_URL,
    credentials: true
}));

initCouponExpirationCheck();


app.use((req, res, next) => {
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
    res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
    next();
});


app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(cookieParser())


app.use(helmet())
app.use(morgan("dev"))

const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: process.env.FRONTEND_URL,
        methods: ["GET", "POST"],
        credentials: true
    }, 
})

io.on("connection", (socket) => {
    console.log("A user connected", socket.id); 


socket.on("send_message", (data) => {
   io.to(data.receiverId).emit("receive_message", data) 
})

socket.on('join_room', (roomId) => {
    socket.join(roomId);
});

socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
});


app.use("/api/admin", adminRoutes);

app.use("/api/admin/products", adminProductRoutes)

app.use("/api/admin/orders", adminOrderRoutes)

app.use("/api/admin/offers", adminOfferRoutes)

app.use("/api/admin/coupons", adminCouponRoutes)

app.use("/api/admin/wallet", adminWalletRoutes)


app.use("/api/chat", messageRoutes)


app.use("/api", userRoutes);

app.use("/api/user/otp", signUpOtpRoutes);

app.use("/api/products", userProductRoutes)

app.use("/api/user/profile", userProfileRoutes)

app.use("/api/user/cart", userCartRoutes)

app.use("/api/user/wishlist", userWishlistRoutes);

app.use('/api/user/orders', userOrderRoutes);

app.use('/api/payments', paymentRoutes);

app.use("/api/user/coupons", userCouponRoutes);


app.use(errorHandler)
app.listen(port, () => console.log(`Server running on port : ${port}`))