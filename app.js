import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import passport from "./config/passport.js";
import { googleCallback } from "./controllers/auth.controller.js";
import authRouter from "./routes/auth.routes.js";
import userRouter from "./routes/user.routes.js";
import addressRouter from "./routes/adresses.routes.js";
import productRouter from "./routes/product.routes.js";
import cartRouter from "./routes/cart.routes.js";
import wishlistRouter from "./routes/wishlist.routes.js";
import paymentRouter from "./routes/payment.routes.js";
import orderRouter from "./routes/order.routes.js";
import { globalLimiter } from "./middlewares/rateLimiter.js";
import { errorHandler, notFoundHandler } from "./middlewares/error.js";

import prisma from "./database/neon.js";
import { FRONTEND_URL } from "./config/env.js";

const app = express();

// CORS — allow the Next.js frontend and production domain to send cookies cross-origin
app.use(cors({
  origin: [
    FRONTEND_URL || 
    "https://castrahouseholds.co.ke",
    "https://www.castrahouseholds.co.ke",
    "http://localhost:3000",
  ],
  credentials: true,
}));

app.use(express.json());
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));

// Global rate limit — applies to every route
app.use(globalLimiter);

// Initialise passport (no session — we use JWT)
app.use(passport.initialize());

app.use("/api/v1/auth", authRouter);
app.use("/api/v1/users", userRouter);
app.use("/api/v1/addresses", addressRouter);
app.use("/api/v1/products", productRouter);
app.use("/api/v1/cart", cartRouter);
app.use("/api/v1/wishlist", wishlistRouter);
app.use("/api/v1/payments", paymentRouter);
app.use("/api/v1/orders", orderRouter);

// We also mount the callback at the root /payment/mpesa/callback since Daraja config often points there
app.use("/payment", paymentRouter);

// Google OAuth routes
// These live at /auth/google (not /api/v1/auth) to match the callback URL
// registered in Google Cloud Console.

// Step 1 — redirect user to Google
app.get(
  "/auth/google",
  passport.authenticate("google", { scope: ["profile", "email"], session: false })
);

// Step 2 — Google redirects back here
app.get(
  "/auth/google/callback",
  passport.authenticate("google", {
    failureRedirect: `${FRONTEND_URL}/account?error=google_failed`,
    session: false,
  }),
  googleCallback  // handled in auth.controller.js with proper token rotation
);

app.get("/", (req, res) => {
  res.send({
    "title": "The Castra Collection ExpressJS Backend API",
    "body": "Welcome to the Castra Collection ExpressJS Backend API"
  })
})

// 404 + global error handler — must be last
app.use(notFoundHandler);
app.use(errorHandler);

async function connectDB() {
  try {
    await prisma.$connect();
    console.log("Database connected successfully");
  } catch (error) {
    console.error("Database connection failed:", error.message);
    process.exit(1);
  }
}

async function startServer() {
  await connectDB();

  app.listen(5500, () => {
    console.log("The Castra Collection ExpressJS Backend API is running on http://localhost:5500");
  });
}

startServer();

export default app;