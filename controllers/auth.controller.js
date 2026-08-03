import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import prisma from "../database/neon.js";
import {
    JWT_SECRET,
    JWT_REFRESH_SECRET,
    JWT_ACCESS_EXPIRY,
    JWT_REFRESH_EXPIRY,
    FRONTEND_URL,
} from "../config/env.js";
import { AppError } from "../middlewares/error.js";
import { sendMail } from "../config/resend.js";
import { resetPasswordEmail } from "../emails/resetPassword.js";
import { verifyEmailTemplate } from "../emails/verifyEmail.js";

// Constants 

const ACCESS_EXPIRY_MS  = 15 * 60 * 1000;           // 15 minutes
const REFRESH_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;  // 7 days

// Token helpers

function generateAccessToken(user) {
    return jwt.sign(
        { id: user.id, email: user.email, role: user.role },
        JWT_SECRET,
        { expiresIn: JWT_ACCESS_EXPIRY || "15m" }
    );
}

function generateRefreshToken(user) {
    return jwt.sign(
        { id: user.id },
        JWT_REFRESH_SECRET,
        { expiresIn: JWT_REFRESH_EXPIRY || "7d" }
    );
}

// Hash the raw refresh token before storing — prevents DB leaks being usable
function hashToken(raw) {
    return crypto.createHash("sha256").update(raw).digest("hex");
}

// Store refresh token in DB (rotates on every use — old one is deleted by caller)
async function saveRefreshToken(userId, rawToken) {
    await prisma.refreshToken.create({
        data: {
            userId,
            token:     hashToken(rawToken),
            expiresAt: new Date(Date.now() + REFRESH_EXPIRY_MS),
        },
    });
}

// Cookie options shared across all token-setting calls
function accessCookieOptions() {
    return {
        httpOnly: true,
        secure:   process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge:   ACCESS_EXPIRY_MS,
    };
}

function refreshCookieOptions() {
    return {
        httpOnly: true,
        secure:   process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge:   REFRESH_EXPIRY_MS,
        path:     "/api/v1/auth",  // refresh token cookie only sent to auth endpoints
    };
}

// Issue both tokens, set cookies, return safe user payload
async function sendTokenResponse(res, user, statusCode = 200) {
    const accessToken  = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    await saveRefreshToken(user.id, refreshToken);

    const { password: _, ...safeUser } = user;

    res
        .status(statusCode)
        .cookie("token",         accessToken,  accessCookieOptions())
        .cookie("refresh_token", refreshToken, refreshCookieOptions())
        .json({ success: true, token: accessToken, user: safeUser });
}

// Controllers 

// POST /api/v1/auth/register
export async function register(req, res, next) {
    try {
        const { firstName, lastName, email, password, phone } = req.body;

        const existing = await prisma.user.findUnique({ where: { email } });
        if (existing) throw new AppError("An account with this email already exists.", 409);

        const hashedPassword = await bcrypt.hash(password, 12);

        // Generate email verification token (URL-safe random bytes)
        const rawVerifyToken = crypto.randomBytes(32).toString("hex");
        const verifyTokenHash = crypto.createHash("sha256").update(rawVerifyToken).digest("hex");
        const verifyExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

        const user = await prisma.user.create({
            data: {
                firstName,
                lastName,
                email,
                password: hashedPassword,
                phone: phone || null,
                verifyEmailToken:  verifyTokenHash,
                verifyEmailExpiry: verifyExpiry,
            },
        });

        // Send verification email — non-blocking, never fails the registration
        const verifyUrl = `${FRONTEND_URL}/api/auth/verify-email?token=${rawVerifyToken}`;
        sendMail({
            to:      email,
            ...verifyEmailTemplate({ firstName, verifyUrl }),
        }).catch((err) => logger.error("[register] verify email send failed", err));

        return sendTokenResponse(res, user, 201);
    } catch (error) {
        next(error);
    }
}

// POST /api/v1/auth/login
export async function login(req, res, next) {
    try {
        const { email, password } = req.body;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) throw new AppError("Invalid email or password.", 401);

        if (!user.password) {
            throw new AppError("This account uses Google sign-in. Please continue with Google.", 401);
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) throw new AppError("Invalid email or password.", 401);

        // Clean up any expired refresh tokens for this user (lazy GC)
        await prisma.refreshToken.deleteMany({
            where: { userId: user.id, expiresAt: { lt: new Date() } },
        });

        return sendTokenResponse(res, user);
    } catch (error) {
        next(error);
    }
}

// POST /api/v1/auth/refresh
// Called by the frontend when the access token expires.
// Validates the refresh token cookie, rotates it, and issues a new access token.
export async function refreshToken(req, res, next) {
    try {
        const raw = req.cookies?.refresh_token;
        if (!raw) throw new AppError("No refresh token provided.", 401);

        // Verify JWT signature and expiry
        let payload;
        try {
            payload = jwt.verify(raw, JWT_REFRESH_SECRET);
        } catch {
            throw new AppError("Refresh token is invalid or expired. Please sign in again.", 401);
        }

        // Check DB — token must exist and not be expired
        const hashed = hashToken(raw);
        const stored = await prisma.refreshToken.findUnique({ where: { token: hashed } });

        if (!stored || stored.expiresAt < new Date()) {
            // Clean up expired record if it exists
            if (stored) await prisma.refreshToken.delete({ where: { id: stored.id } });
            throw new AppError("Refresh token has been revoked or expired. Please sign in again.", 401);
        }

        // Fetch fresh user data
        const user = await prisma.user.findUnique({ where: { id: payload.id } });
        if (!user) throw new AppError("User not found.", 401);

        // Rotate — delete old token and issue a new pair
        await prisma.refreshToken.delete({ where: { id: stored.id } });

        const newAccessToken  = generateAccessToken(user);
        const newRefreshToken = generateRefreshToken(user);
        await saveRefreshToken(user.id, newRefreshToken);

        const { password: _, ...safeUser } = user;

        return res
            .status(200)
            .cookie("token",         newAccessToken,  accessCookieOptions())
            .cookie("refresh_token", newRefreshToken, refreshCookieOptions())
            .json({ success: true, token: newAccessToken, user: safeUser });
    } catch (error) {
        next(error);
    }
}

// POST /api/v1/auth/logout
// Revokes the refresh token and clears both cookies.
export async function logout(req, res, next) {
    try {
        const raw = req.cookies?.refresh_token;

        if (raw) {
            const hashed = hashToken(raw);
            // Delete silently — token may already be expired/rotated
            await prisma.refreshToken.deleteMany({ where: { token: hashed } });
        }

        res
            .clearCookie("token", {
                httpOnly: true,
                secure:   process.env.NODE_ENV === "production",
                sameSite: "lax",
            })
            .clearCookie("refresh_token", {
                httpOnly: true,
                secure:   process.env.NODE_ENV === "production",
                sameSite: "lax",
                path:     "/api/v1/auth",
            })
            .status(200)
            .json({ success: true, message: "Signed out successfully." });
    } catch (error) {
        next(error);
    }
}

// GET /api/v1/auth/me
export async function getMe(req, res, next) {
    try {
        const user = await prisma.user.findUnique({
            where:  { id: req.user.id },
            select: { id: true, firstName: true, lastName: true, email: true, phone: true, role: true, emailVerified: true, createdAt: true },
        });

        if (!user) throw new AppError("User not found.", 404);
        return res.status(200).json({ success: true, user });
    } catch (error) {
        next(error);
    }
}

// GET /auth/google/callback
export async function googleCallback(req, res, next) {
    try {
        const user = req.user;
        if (!user) return res.redirect(`${process.env.FRONTEND_URL}/account?error=google_failed`);

        const accessToken  = generateAccessToken(user);
        const refreshToken = generateRefreshToken(user);
        await saveRefreshToken(user.id, refreshToken);

        const dashboard = user.role === "ADMIN" ? "/account/dashboard/admin" : "/account/dashboard";

        res
            .cookie("token",         accessToken,  accessCookieOptions())
            .cookie("refresh_token", refreshToken, refreshCookieOptions())
            .redirect(`${process.env.FRONTEND_URL}${dashboard}`);
    } catch (error) {
        next(error);
    }
}

// POST /api/v1/auth/forgot-password
// Accepts an email, generates a reset token, and sends the reset link.
// Always returns 200 to avoid leaking which emails exist.
export async function forgotPassword(req, res, next) {
    try {
        const { email } = req.body;

        const user = await prisma.user.findUnique({ where: { email } });

        // Always respond 200 — don't reveal whether the email is registered
        if (!user || !user.password) {
            // For Google-only accounts there's no password to reset — still silent
            return res.status(200).json({
                success: true,
                message: "If that email is linked to an account, you'll receive a reset link shortly.",
            });
        }

        // Generate a URL-safe token; store only the SHA-256 hash in the DB
        const rawToken  = crypto.randomBytes(32).toString("hex");
        const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
        const expiry    = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

        await prisma.user.update({
            where: { id: user.id },
            data:  {
                resetPasswordToken:  tokenHash,
                resetPasswordExpiry: expiry,
            },
        });

        const resetUrl = `${FRONTEND_URL}/account/reset-password?token=${rawToken}`;

        await sendMail({
            to:      email,
            ...resetPasswordEmail({ firstName: user.firstName, resetUrl }),
        });

        return res.status(200).json({
            success: true,
            message: "If that email is linked to an account, you'll receive a reset link shortly.",
        });
    } catch (error) {
        next(error);
    }
}

// POST /api/v1/auth/reset-password
// Validates the reset token and sets the new password.
export async function resetPassword(req, res, next) {
    try {
        const { token, password } = req.body;

        // Hash the incoming raw token to compare against the stored hash
        const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

        const user = await prisma.user.findFirst({
            where: {
                resetPasswordToken:  tokenHash,
                resetPasswordExpiry: { gt: new Date() },
            },
        });

        if (!user) {
            throw new AppError("This reset link is invalid or has expired. Please request a new one.", 400);
        }

        const hashedPassword = await bcrypt.hash(password, 12);

        await prisma.user.update({
            where: { id: user.id },
            data:  {
                password:            hashedPassword,
                resetPasswordToken:  null,
                resetPasswordExpiry: null,
            },
        });

        // Revoke all refresh tokens so any stolen sessions are invalidated
        await prisma.refreshToken.deleteMany({ where: { userId: user.id } });

        return res.status(200).json({
            success: true,
            message: "Your password has been reset successfully. Please sign in with your new password.",
        });
    } catch (error) {
        next(error);
    }
}

// GET /api/v1/auth/verify-email?token=<raw>
// Called when the user clicks the link in their verification email.
// On success redirects to the dashboard with a verified=1 flag.
export async function verifyEmail(req, res, next) {
    try {
        const { token } = req.query;

        if (!token) throw new AppError("Verification token is missing.", 400);

        const tokenHash = crypto.createHash("sha256").update(String(token)).digest("hex");

        const user = await prisma.user.findFirst({
            where: {
                verifyEmailToken:  tokenHash,
                verifyEmailExpiry: { gt: new Date() },
            },
        });

        if (!user) {
            // Redirect to account page with an error param so the UI can surface it
            return res.redirect(`${FRONTEND_URL}/account?error=verification_failed`);
        }

        await prisma.user.update({
            where: { id: user.id },
            data:  {
                emailVerified:     true,
                verifyEmailToken:  null,
                verifyEmailExpiry: null,
            },
        });

        return res.redirect(`${FRONTEND_URL}/account/dashboard?verified=1`);
    } catch (error) {
        next(error);
    }
}

// POST /api/v1/auth/resend-verification
// Re-sends the verification email to the given address.
// Rate-limited via authLimiter on the route.
export async function resendVerification(req, res, next) {
    try {
        const { email } = req.body;

        const user = await prisma.user.findUnique({ where: { email } });

        // Always 200 — don't leak which emails are registered
        if (!user || user.emailVerified) {
            return res.status(200).json({
                success: true,
                message: "If that email is linked to an unverified account, we've sent a new link.",
            });
        }

        const rawToken  = crypto.randomBytes(32).toString("hex");
        const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
        const expiry    = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

        await prisma.user.update({
            where: { id: user.id },
            data:  {
                verifyEmailToken:  tokenHash,
                verifyEmailExpiry: expiry,
            },
        });

        const verifyUrl = `${FRONTEND_URL}/api/v1/auth/verify-email?token=${rawToken}`;

        await sendMail({
            to:      email,
            ...verifyEmailTemplate({ firstName: user.firstName, verifyUrl }),
        });

        return res.status(200).json({
            success: true,
            message: "If that email is linked to an unverified account, we've sent a new link.",
        });
    } catch (error) {
        next(error);
    }
}
