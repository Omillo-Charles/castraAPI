import { Router } from "express";
import passport from "../config/passport.js";
import {
    register, login, logout, getMe, refreshToken, googleCallback,
    forgotPassword, resetPassword, verifyEmail, resendVerification,
} from "../controllers/auth.controller.js";
import { requireAuth } from "../middlewares/requireAuth.js";
import { authLimiter } from "../middlewares/rateLimiter.js";
import { validate, registerSchema, loginSchema, forgotPasswordSchema, resetPasswordSchema, resendVerificationSchema } from "../middlewares/validator.js";

const authRouter = Router();

authRouter.post("/register",             authLimiter, validate(registerSchema),             register);
authRouter.post("/login",                authLimiter, validate(loginSchema),                login);
authRouter.post("/logout",               logout);
authRouter.post("/refresh",              refreshToken);   // no auth required — uses refresh token cookie
authRouter.get( "/me",                   requireAuth, getMe);

// Forgot / reset password
authRouter.post("/forgot-password",      authLimiter, validate(forgotPasswordSchema),       forgotPassword);
authRouter.post("/reset-password",       authLimiter, validate(resetPasswordSchema),        resetPassword);

// Email verification
authRouter.get( "/verify-email",         verifyEmail);   // GET — link from email, redirects
authRouter.post("/resend-verification",  authLimiter, validate(resendVerificationSchema),   resendVerification);

//Google OAuth
// Step 1 — redirect user to Google consent screen
authRouter.get(
    "/google",
    passport.authenticate("google", { scope: ["profile", "email"], session: false })
);

// Step 2 — Google redirects back here with the auth code
authRouter.get(
    "/google/callback",
    passport.authenticate("google", {
        session:      false,
        failureRedirect: `${process.env.FRONTEND_URL}/account?error=google_failed`,
    }),
    googleCallback
);

export default authRouter;
