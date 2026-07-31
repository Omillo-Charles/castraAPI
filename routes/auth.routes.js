import { Router } from "express";
import passport from "../config/passport.js";
import { register, login, logout, getMe, googleCallback } from "../controllers/auth.controller.js";
import { requireAuth } from "../middlewares/requireAuth.js";
import { authLimiter } from "../middlewares/rateLimiter.js";

const authRouter = Router();

//Email / password
authRouter.post("/register", authLimiter, register);
authRouter.post("/login",    authLimiter, login);
authRouter.post("/logout",   logout);

//Protected
authRouter.get("/me", requireAuth, getMe);

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
