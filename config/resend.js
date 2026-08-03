import { Resend } from "resend";
import { RESEND_API_KEY, RESEND_FROM, NODE_ENV } from "./env.js";
import { logger } from "../middlewares/logger.js";

// Client
// Lazily initialised so the server boots even when the key is missing in local
// dev without Resend configured. All send calls are wrapped in try/catch in the
// controllers so a missing key never crashes a request.

let _client = null;

function getClient() {
    if (_client) return _client;
    if (!RESEND_API_KEY || RESEND_API_KEY === "your_resend_api_key_here") {
        return null;
    }
    _client = new Resend(RESEND_API_KEY);
    return _client;
}

// Default from address — falls back to a safe domain if env is missing
const DEFAULT_FROM = RESEND_FROM || "Castra Households <info@castrahouseholds.co.ke>";

// sendMail
// Drop-in replacement for the old nodemailer sendMail.
// Accepts the same { to, subject, html, text, from? } shape.

export async function sendMail({ to, subject, html, text, from } = {}) {
    if (!to || !subject) {
        throw new Error("Recipient and subject are required for email delivery.");
    }

    const client = getClient();

    if (!client) {
        // Resend not configured — log and skip gracefully in non-production
        if (NODE_ENV !== "production") {
            logger.warn(`[resend] RESEND_API_KEY not set — email skipped. Would have sent: "${subject}" → ${to}`);
        }
        return { id: null, skipped: true };
    }

    const { data, error } = await client.emails.send({
        from:    from || DEFAULT_FROM,
        to:      Array.isArray(to) ? to : [to],
        subject,
        html,
        text,
    });

    if (error) {
        throw new Error(`[resend] Failed to send email: ${error.message}`);
    }

    if (NODE_ENV === "development") {
        logger.info(`[resend] Email sent: "${subject}" → ${to} (id: ${data?.id})`);
    }

    return data;
}
