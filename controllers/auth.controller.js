import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import prisma from "../database/neon.js";
import {
    JWT_SECRET,
    JWT_REFRESH_SECRET,
    JWT_ACCESS_EXPIRY,
    JWT_REFRESH_EXPIRY,
} from "../config/env.js";
import { AppError } from "../middlewares/error.js";

// ─── Constants ─────────────────────────────────────────────────────────────────

const ACCESS_EXPIRY_MS  = 15 * 60 * 1000;           // 15 minutes
const REFRESH_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;  // 7 days

// ─── Token helpers ─────────────────────────────────────────────────────────────

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

// ─── Controllers ───────────────────────────────────────────────────────────────

// POST /api/v1/auth/register
export async function register(req, res, next) {
    try {
        const { firstName, lastName, email, password, phone } = req.body;

        const existing = await prisma.user.findUnique({ where: { email } });
        if (existing) throw new AppError("An account with this email already exists.", 409);

        const hashedPassword = await bcrypt.hash(password, 12);
        const user = await prisma.user.create({
            data: { firstName, lastName, email, password: hashedPassword, phone: phone || null },
        });

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
