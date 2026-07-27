import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import prisma from "../database/neon.js";
import { JWT_SECRET, JWT_EXPIRY } from "../config/env.js";

// Helpers

// Generate a signed JWT for the given user
function generateToken(user) {
    return jwt.sign(
        { id: user.id, email: user.email, role: user.role },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRY || "7d" }
    );
}

//Set the JWT as an httpOnly cookie and return it in the response body.
//httpOnly prevents JS from reading the token — XSS mitigation.
function sendTokenResponse(res, user, statusCode = 200) {
    const token = generateToken(user);

    const cookieOptions = {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
    };

    const { password: _, ...safeUser } = user;

    res.status(statusCode)
        .cookie("token", token, cookieOptions)
        .json({
            success: true,
            token,
            user: safeUser,
        });
}

// Register

// POST /api/v1/auth/register
// Body: { firstName, lastName, email, password, phone? }
export async function register(req, res) {
    try {
        const { firstName, lastName, email, password, phone } = req.body;

        // Validate required fields
        if (!firstName || !lastName || !email || !password) {
            return res.status(400).json({
                success: false,
                message: "First name, last name, email and password are required.",
            });
        }

        // Password strength — minimum 8 characters
        if (password.length < 8) {
            return res.status(400).json({
                success: false,
                message: "Password must be at least 8 characters.",
            });
        }

        // Check if email already exists
        const existing = await prisma.user.findUnique({ where: { email } });
        if (existing) {
            return res.status(409).json({
                success: false,
                message: "An account with this email already exists.",
            });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 12);

        // Create user
        const user = await prisma.user.create({
            data: {
                firstName,
                lastName,
                email,
                password: hashedPassword,
                phone: phone || null,
            },
        });

        return sendTokenResponse(res, user, 201);
    } catch (error) {
        console.error("[register]", error);
        return res.status(500).json({
            success: false,
            message: "Server error. Please try again.",
        });
    }
}

//Login

// POST /api/v1/auth/login
// Body: { email, password }
export async function login(req, res) {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: "Email and password are required.",
            });
        }

        // Find user — include password for comparison
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password.",
            });
        }

        // Google OAuth users have no password
        if (!user.password) {
            return res.status(401).json({
                success: false,
                message: "This account uses Google sign-in. Please continue with Google.",
            });
        }

        // Compare password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password.",
            });
        }

        return sendTokenResponse(res, user);
    } catch (error) {
        console.error("[login]", error);
        return res.status(500).json({
            success: false,
            message: "Server error. Please try again.",
        });
    }
}

// Sign Out

// POST /api/v1/auth/logout
// Clears the auth cookie.
export async function logout(req, res) {
    res.clearCookie("token", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
    });

    return res.status(200).json({
        success: true,
        message: "Signed out successfully.",
    });
}

// Get current user

// GET /api/v1/auth/me
// Returns the currently authenticated user.
// Protected — requires requireAuth middleware.
export async function getMe(req, res) {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.user.id },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                phone: true,
                role: true,
                emailVerified: true,
                createdAt: true,
            },
        });

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found.",
            });
        }

        return res.status(200).json({ success: true, user });
    } catch (error) {
        console.error("[getMe]", error);
        return res.status(500).json({
            success: false,
            message: "Server error.",
        });
    }
}
