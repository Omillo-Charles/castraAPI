import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../config/env.js";

// Middleware — verifies the JWT from the httpOnly cookie or Authorization header.
// Attaches the decoded payload to req.user.
export function requireAuth(req, res, next) {
    try {
        // Accept token from cookie (preferred) or Authorization: Bearer <token>
        const token =
            req.cookies?.token ||
            req.headers?.authorization?.split(" ")[1];

        if (!token) {
            return res.status(401).json({
                success: false,
                message: "Not authenticated. Please sign in.",
            });
        }

        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded; // { id, email, role }
        next();
    } catch (error) {
        return res.status(401).json({
            success: false,
            message: "Session expired or invalid. Please sign in again.",
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
