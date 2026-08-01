import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../config/env.js";

// Middleware — verifies the short-lived access token (15 min).
// Token accepted from:
//   1. httpOnly cookie named "token" (set on login/refresh)
//   2. Authorization: Bearer <token> header (for API clients)
//
// On expiry the client should call POST /api/v1/auth/refresh with its
// refresh_token cookie to obtain a new access token.
export function requireAuth(req, res, next) {
    const token =
        req.cookies?.token ||
        req.headers?.authorization?.split(" ")[1];

    if (!token) {
        return res.status(401).json({
            success: false,
            message: "Not authenticated. Please sign in.",
        });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded; // { id, email, role }
        next();
    } catch (error) {
        // Distinguish expired from invalid so the frontend can decide to refresh
        if (error.name === "TokenExpiredError") {
            return res.status(401).json({
                success:  false,
                code:     "TOKEN_EXPIRED",
                message:  "Access token expired. Please refresh your session.",
            });
        }
        return res.status(401).json({
            success: false,
            message: "Invalid token. Please sign in again.",
        });
    }
}

// Middleware — only allows users with ADMIN role.
// Must be used after requireAuth.
export function requireAdmin(req, res, next) {
    if (req.user?.role !== "ADMIN") {
        return res.status(403).json({
            success: false,
            message: "Access denied. Admins only.",
        });
    }
    next();
}
