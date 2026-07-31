import { NODE_ENV } from "../config/env.js";

// AppError
// Throw this anywhere in a controller to send a predictable HTTP error response.
// All other errors (unexpected exceptions, Prisma errors, etc.) fall through to
// the global handler which normalises them before responding.
// Usage:
// throw new AppError("Product not found.", 404);
// throw new AppError("Email already in use.", 409);

export class AppError extends Error {
    constructor(message, statusCode = 500) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = true; // known, expected error — not a bug
        Error.captureStackTrace(this, this.constructor);
    }
}

// Prisma error normaliser
// Maps common Prisma error codes to human-readable messages + HTTP status codes
// so the global handler can respond meaningfully instead of leaking DB details.

function normalisePrismaError(err) {
    switch (err.code) {
        case "P2002": {
            // Unique constraint violation — e.g. duplicate email
            const fields = err.meta?.target?.join(", ") ?? "field";
            return new AppError(`A record with this ${fields} already exists.`, 409);
        }
        case "P2025":
            // Record not found (e.g. update/delete on non-existent row)
            return new AppError("The requested record was not found.", 404);
        case "P2003":
            // Foreign key constraint violation
            return new AppError("This operation references a record that does not exist.", 400);
        case "P2014":
            // Required relation violation
            return new AppError("A required relation is missing.", 400);
        default:
            return null; // Let the generic handler deal with it
    }
}

// Global error handler
// Must be registered LAST in app.js (after all routes) with exactly 4 params
// so Express recognises it as an error-handling middleware.
// app.use(errorHandler);

export function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
    // Prisma errors
    if (err.constructor?.name === "PrismaClientKnownRequestError" || err.code?.startsWith?.("P2")) {
        const normalised = normalisePrismaError(err);
        if (normalised) {
            console.error(`[${req.method} ${req.path}] Prisma ${err.code}:`, err.message);
            return res.status(normalised.statusCode).json({
                success: false,
                message: normalised.message,
            });
        }
    }

    // JWT errors
    if (err.name === "JsonWebTokenError") {
        return res.status(401).json({ success: false, message: "Invalid or malformed token." });
    }
    if (err.name === "TokenExpiredError") {
        return res.status(401).json({ success: false, message: "Your session has expired. Please log in again." });
    }

    // Multer errors (file upload)
    if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({ success: false, message: "File too large." });
    }
    if (err.code === "LIMIT_FILE_COUNT") {
        return res.status(400).json({ success: false, message: "Too many files uploaded." });
    }
    if (err.code === "LIMIT_UNEXPECTED_FILE") {
        return res.status(400).json({ success: false, message: "Unexpected file field." });
    }

    // Operational AppError (thrown deliberately in controllers)
    if (err.isOperational) {
        return res.status(err.statusCode).json({
            success: false,
            message: err.message,
        });
    }

    // Unknown / unexpected error
    // Log the full error internally; never expose stack traces in production.
    console.error(`[${req.method} ${req.path}]`, err);

    return res.status(500).json({
        success: false,
        message: "Something went wrong on our end. Please try again.",
        ...(NODE_ENV === "development" && { error: err.message, stack: err.stack }),
    });
}

// 404 handler
// Catches requests that didn't match any route.
// Register this just before errorHandler in app.js.

export function notFoundHandler(req, res, next) {
    next(new AppError(`Route ${req.method} ${req.path} not found.`, 404));
}
