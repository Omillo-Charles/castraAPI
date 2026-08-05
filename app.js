import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
// Sentry must be initialised before any other import so its auto-instrumentation
// hooks wrap Express, http, and other modules from the very start.
import { sentryRequestHandler, sentryErrorHandler, logger } from "./middlewares/logger.js";
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
import { FRONTEND_URL, PORT } from "./config/env.js";

const app = express();

// Trust the first hop from the reverse proxy (Render, Railway, Vercel, etc.)
// Required so req.ip resolves the real client IP, not the proxy's IP.
// This is critical for IP allowlisting and rate limiting to work correctly.
app.set("trust proxy", 1);

// Sentry request handler — must be the very first middleware so every request
// gets wrapped in a Sentry transaction for performance tracing.
app.use(sentryRequestHandler());

// CORS — allow the Next.js frontend and production domain to send cookies cross-origin
app.use(cors({
  origin: [
    FRONTEND_URL,
    "https://castrahouseholds.co.ke",
    "https://www.castrahouseholds.co.ke",
    "http://localhost:3000",
  ].filter(Boolean),
  credentials: true,
}));

// Security headers — sets X-Frame-Options, X-Content-Type-Options, HSTS,
// Referrer-Policy, and more. Must be before routes.
app.use(helmet({
  contentSecurityPolicy: false, // disabled — CSP for an API with cookie auth
  // is handled at the frontend (Next.js) level
}));

app.use(express.json({ limit: "50kb" }));
app.use(cookieParser());
app.use(express.urlencoded({ extended: true, limit: "50kb" }));

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
  res.status(200).json({ ok: true });
})

// 404 + global error handler — must be last
app.use(notFoundHandler);
// Sentry error handler — captures unhandled errors before our own handler runs.
// Must sit between notFoundHandler and errorHandler.
app.use(sentryErrorHandler());
app.use(errorHandler);

async function connectDB() {
  const MAX_RETRIES = 3;
  const RETRY_DELAY_MS = 5000;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await prisma.$connect();
      logger.info("Database connected successfully");
      return;
    } catch (error) {
      const isLastAttempt = attempt === MAX_RETRIES;
      if (isLastAttempt) {
        logger.error(`Database connection failed after ${MAX_RETRIES} attempts`, error);
        process.exit(1);
      }
      logger.warn(`Database connection attempt ${attempt} failed — retrying in ${RETRY_DELAY_MS / 1000}s...`);
      await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
    }
  }
}

async function startServer() {
  await connectDB();

  app.listen(5500, () => {
    logger.info(`The Castra Collection ExpressJS Backend API is running on http://localhost:${PORT}`);
  });
}

startServer();

export default app;