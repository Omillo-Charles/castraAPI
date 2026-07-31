import { randomUUID } from "crypto";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../config/env.js";

// Cookie name for the guest session token
export const GUEST_SESSION_COOKIE = "castra_session";

// How long a guest session lives — 30 days
const GUEST_SESSION_MAX_AGE = 30 * 24 * 60 * 60 * 1000;

/**
 * resolveCart
 *
 * Runs on every cart and order-placement route (no auth required).
 * Determines who owns the cart — an authenticated user or an anonymous guest —
 * and attaches a unified `req.cartOwner` object that the rest of the stack uses.
 *
 * req.cartOwner shape:
 *   { type: "user",  userId: string,    sessionId: null   }  — logged-in user
 *   { type: "guest", userId: null,      sessionId: string }  — anonymous guest
 *
 * Guest sessions:
 *   - Created on first cart interaction via a secure httpOnly cookie.
 *   - UUID stored in the cookie; used as the cart / order sessionId in the DB.
 *   - The cookie is refreshed (rolling expiry) on every request.
 *
 * If the request carries a valid JWT the user takes precedence — the guest
 * session cookie is left untouched so it can be merged later if needed.
 */
export function resolveCart(req, res, next) {
    // Try authenticated user first
    const token =
        req.cookies?.token ||
        req.headers?.authorization?.split(" ")[1];

    if (token) {
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            req.user      = decoded;              // keep req.user for downstream compat
            req.cartOwner = { type: "user", userId: decoded.id, sessionId: null };
            return next();
        } catch {
            // Token present but invalid/expired — treat as guest, don't error
        }
    }

    // Guest — read or create session cookie
    let sessionId = req.cookies?.[GUEST_SESSION_COOKIE];

    if (!sessionId) {
        sessionId = randomUUID();
    }

    // Refresh / set the cookie on every response (rolling expiry)
    res.cookie(GUEST_SESSION_COOKIE, sessionId, {
        httpOnly: true,
        secure:   process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge:   GUEST_SESSION_MAX_AGE,
    });

    req.cartOwner = { type: "guest", userId: null, sessionId };
    next();
}
