import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import jwt from "jsonwebtoken";
import passport from "./config/passport.js";
import authRouter     from "./routes/auth.routes.js";
import userRouter     from "./routes/user.routes.js";
import addressRouter  from "./routes/adresses.routes.js";
import productRouter  from "./routes/product.routes.js";
import cartRouter     from "./routes/cart.routes.js";
import wishlistRouter from "./routes/wishlist.routes.js";
import paymentRouter  from "./routes/payment.routes.js";
import orderRouter    from "./routes/order.routes.js";
import prisma from "./database/neon.js";
import { FRONTEND_URL, JWT_SECRET, JWT_EXPIRY } from "./config/env.js";

const app = express();

// CORS — allow the Next.js frontend to send cookies cross-origin
app.use(cors({
  origin: FRONTEND_URL || "http://localhost:3000",
  credentials: true,
}));

app.use(express.json());
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));

// Initialise passport (no session — we use JWT)
app.use(passport.initialize());

app.use("/api/v1/auth",      authRouter);
app.use("/api/v1/users",     userRouter);
app.use("/api/v1/addresses", addressRouter);
app.use("/api/v1/products",  productRouter);
app.use("/api/v1/cart",      cartRouter);
app.use("/api/v1/wishlist",  wishlistRouter);
app.use("/api/v1/payments",  paymentRouter);
app.use("/api/v1/orders",    orderRouter);

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
  (req, res) => {
    const user = req.user;
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRY || "7d" }
    );

    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    const destination = user.role === "ADMIN"
      ? `${FRONTEND_URL}/account/dashboard/admin`
      : `${FRONTEND_URL}/account/dashboard`;

    res.redirect(destination);
  }
);

app.get("/", (req, res) => {
  res.send({
    "title": "The Castra Collection ExpressJS Backend API",
    "body": "Welcome to the Castra Collection ExpressJS Backend API"
  })
})

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