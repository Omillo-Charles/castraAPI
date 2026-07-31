import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import prisma from "../database/neon.js";
import { JWT_SECRET, JWT_EXPIRY } from "../config/env.js";
import { AppError } from "../middlewares/error.js";

function generateToken(user) {
    return jwt.sign(
        { id: user.id, email: user.email, role: user.role },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRY || "7d" }
    );
}

function sendTokenResponse(res, user, statusCode = 200) {
    const token = generateToken(user);
    const { password: _, ...safeUser } = user;
    res.status(statusCode)
        .cookie("token", token, {
            httpOnly: true,
            secure:   process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge:   7 * 24 * 60 * 60 * 1000,
        })
        .json({ success: true, token, user: safeUser });
}

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

// POST /api/v1/auth/logout
export async function logout(req, res) {
    res.clearCookie("token", {
        httpOnly: true,
        secure:   process.env.NODE_ENV === "production",
        sameSite: "lax",
    });
    return res.status(200).json({ success: true, message: "Signed out successfully." });
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

        const token = generateToken(user);
        const dashboard = user.role === "ADMIN" ? "/account/dashboard/admin" : "/account/dashboard";

        res.cookie("token", token, {
            httpOnly: true,
            secure:   process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge:   7 * 24 * 60 * 60 * 1000,
        }).redirect(`${process.env.FRONTEND_URL}${dashboard}`);
    } catch (error) {
        next(error);
    }
}
