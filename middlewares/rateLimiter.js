import { rateLimit } from "express-rate-limit";

// shared response helper
const tooManyRequests = (req, res) =>
    res.status(429).json({
        success: false,
        message: "Too many requests. Please slow down and try again shortly.",
    });

// Global fallback
// Applied to every route. Generous enough that normal usage never hits it —
// it exists purely to catch bots hammering arbitrary endpoints.
export const globalLimiter = rateLimit({
    windowMs:        15 * 60 * 1000, // 15 minutes
    max:             300,             // 300 req / IP / 15 min
    standardHeaders: "draft-7",
    legacyHeaders:   false,
    handler:         tooManyRequests,
});

// Auth
// Login & register — tight to stop brute-force and credential stuffing.
export const authLimiter = rateLimit({
    windowMs:        15 * 60 * 1000, // 15 minutes
    max:             10,              // 10 attempts / IP / 15 min
    standardHeaders: "draft-7",
    legacyHeaders:   false,
    handler: (req, res) =>
        res.status(429).json({
            success: false,
            message: "Too many login attempts. Please wait 15 minutes before trying again.",
        }),
});

// Order placement
// Stops someone from spamming order creation / inventory manipulation.
export const orderLimiter = rateLimit({
    windowMs:        10 * 60 * 1000, // 10 minutes
    max:             15,              // 15 orders / IP / 10 min
    standardHeaders: "draft-7",
    legacyHeaders:   false,
    handler:         tooManyRequests,
});

// STK Push
// M-Pesa STK pushes cost money per request — keep this very tight.
export const stkLimiter = rateLimit({
    windowMs:        5 * 60 * 1000,  // 5 minutes
    max:             5,               // 5 STK attempts / IP / 5 min
    standardHeaders: "draft-7",
    legacyHeaders:   false,
    handler: (req, res) =>
        res.status(429).json({
            success: false,
            message: "Too many payment attempts. Please wait a few minutes before retrying.",
        }),
});

// Public search / track
// Order tracking is public — moderate limit to prevent scraping.
export const publicLimiter = rateLimit({
    windowMs:        10 * 60 * 1000, // 10 minutes
    max:             60,              // 60 req / IP / 10 min
    standardHeaders: "draft-7",
    legacyHeaders:   false,
    handler:         tooManyRequests,
});

// Admin write actions
// Status patches, product management, etc. Admins shouldn't be bulk-updating
// hundreds of records — if they are, something is wrong.
export const adminWriteLimiter = rateLimit({
    windowMs:        5 * 60 * 1000,  // 5 minutes
    max:             100,             // 100 write ops / IP / 5 min
    standardHeaders: "draft-7",
    legacyHeaders:   false,
    handler:         tooManyRequests,
});
