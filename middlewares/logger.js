/**
 * logger.js
 *
 * Sentry initialisation + thin logging helpers used across the API.
 *
 * IMPORTANT — this file must be imported FIRST in app.js, before any other
 * import, so Sentry can instrument all modules (Express, Prisma, http, etc.)
 * via its auto-instrumentation hooks.
 *
 * Usage in app.js:
 *   import "./middlewares/logger.js";          // side-effect: inits Sentry
 *   import { sentryRequestHandler,
 *            sentryErrorHandler,
 *            logger }   from "./middlewares/logger.js";
 *
 * Usage anywhere else:
 *   import { logger } from "../middlewares/logger.js";
 *   logger.info("Server started on port 5500");
 *   logger.error("Unexpected failure", err);
 *   logger.captureException(err, { extra: { orderId } });
 */

import * as Sentry from "@sentry/node";
import { NODE_ENV, SENTRY_DSN, SENTRY_ENVIRONMENT } from "../config/env.js";

// Initialise Sentry
// Called once as a side-effect of importing this module.
// No-ops gracefully when SENTRY_DSN is absent (local dev without Sentry).

const isConfigured = Boolean(SENTRY_DSN && SENTRY_DSN !== "your_sentry_dsn_here");

if (isConfigured) {
    Sentry.init({
        dsn: SENTRY_DSN,

        environment: SENTRY_ENVIRONMENT || NODE_ENV || "development",

        // Capture 100 % of transactions in dev/staging; tune down in production
        // via the SENTRY_TRACES_SAMPLE_RATE env var.
        tracesSampleRate: NODE_ENV === "production" ? 0.2 : 1.0,

        // Attach full request bodies + user info to every error event
        sendDefaultPii: false, // never send passwords / tokens — strip at source

        // Filter out noise: 4xx operational errors are expected, not bugs.
        // Only send 5xx and truly unexpected errors to Sentry.
        beforeSend(event, hint) {
            const err = hint?.originalException;
            // Suppress operational AppErrors (thrown deliberately in controllers)
            if (err?.isOperational) return null;
            // Suppress 4xx client errors
            if (err?.statusCode >= 400 && err?.statusCode < 500) return null;
            return event;
        },
    });

    console.log(`[sentry] Initialised — env: ${SENTRY_ENVIRONMENT || NODE_ENV}`);
} else {
    console.warn("[sentry] SENTRY_DSN not set — error reporting disabled.");
}

// Express middleware helpers
// sentryRequestHandler
// Wraps each incoming request in a Sentry transaction / trace.
// Register BEFORE all routes in app.js.

export function sentryRequestHandler() {
    if (!isConfigured) return (_req, _res, next) => next();
    // Sentry v8 uses `Sentry.expressErrorHandler` — the request handler is
    // automatic via `Sentry.init` + express integration. Expose a no-op for
    // forward-compatibility and clarity in app.js.
    return (_req, _res, next) => next();
}


// sentryErrorHandler
// Captures unhandled errors and forwards them to Sentry before Express's own
// error handler runs.  Register AFTER all routes, BEFORE errorHandler.
export function sentryErrorHandler() {
    if (!isConfigured) return (_err, _req, _res, next) => next(_err);
    return Sentry.expressErrorHandler();
}

// Logger 
// Thin wrapper that:
// Always writes to stdout/stderr with timestamps
// Forwards errors + warnings to Sentry when configured
// Is a drop-in replacement for bare `console.*` calls

function timestamp() {
    return new Date().toISOString();
}

function prefix(level) {
    return `[${timestamp()}] [${level.toUpperCase()}]`;
}

export const logger = {
    /**
     * General informational log — stdout only, never sent to Sentry.
     * @param {string} message
     * @param {...*}   args
     */
    info(message, ...args) {
        console.log(prefix("info"), message, ...args);
    },

    /**
     * Non-critical warning — stdout + Sentry breadcrumb.
     * @param {string} message
     * @param {...*}   args
     */
    warn(message, ...args) {
        console.warn(prefix("warn"), message, ...args);
        if (isConfigured) {
            Sentry.addBreadcrumb({ level: "warning", message, data: args.length ? { args } : undefined });
        }
    },

    /**
     * Error log — stderr + capture to Sentry.
     * Pass an Error instance as the second argument for a full stack trace.
     * @param {string}   message
     * @param {Error}    [err]
     * @param {object}   [extra]  – extra context attached to the Sentry event
     */
    error(message, err, extra) {
        console.error(prefix("error"), message, err ?? "");
        if (isConfigured) {
            if (err instanceof Error) {
                Sentry.captureException(err, { extra: { message, ...extra } });
            } else {
                Sentry.captureMessage(message, { level: "error", extra });
            }
        }
    },

    /**
     * Explicitly capture an exception with optional extra context.
     * Use this in catch blocks for non-request-level errors (e.g. background jobs).
     * @param {Error}  err
     * @param {object} [extra]
     */
    captureException(err, extra) {
        console.error(prefix("exception"), err);
        if (isConfigured) {
            Sentry.captureException(err, { extra });
        }
    },

    /**
     * Attach contextual data to the current Sentry scope
     * (e.g. authenticated user info after login).
     * @param {{ id: string, email: string, role: string }} user
     */
    setUser(user) {
        if (isConfigured) {
            Sentry.setUser({ id: user.id, email: user.email, role: user.role });
        }
    },

    /** Clear the current user from the Sentry scope (on logout). */
    clearUser() {
        if (isConfigured) {
            Sentry.setUser(null);
        }
    },
};
