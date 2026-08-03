import { NODE_ENV } from "../config/env.js";
import { logger } from "./logger.js";

// Safaricom published IP ranges
// Source: Safaricom Daraja developer portal (production + sandbox)
// https://developer.safaricom.co.ke/apis
// These are the only IPs that should ever POST to our M-Pesa callback.
// Allowlist checked on every inbound callback request.

const SAFARICOM_CIDR_BLOCKS = [
    // Production
    "196.201.214.0/24",
    "196.201.214.200/24",
    "196.201.216.0/23",
    "196.201.218.0/24",
    "196.201.219.0/24",
    "196.201.220.0/24",
    // Sandbox (Daraja test environment)
    "196.201.212.0/23",
];

// Convert a CIDR block to a numeric range for fast comparison
function cidrToRange(cidr) {
    const [base, bits] = cidr.split("/");
    const mask   = ~((1 << (32 - Number(bits))) - 1) >>> 0;
    const numeric = ipToLong(base);
    return { start: (numeric & mask) >>> 0, end: ((numeric & mask) | ~mask) >>> 0 };
}

function ipToLong(ip) {
    return ip.split(".").reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
}

const RANGES = SAFARICOM_CIDR_BLOCKS.map(cidrToRange);

function isAllowedIp(ip) {
    // Strip IPv6-mapped IPv4 prefix (::ffff:x.x.x.x)
    const clean = ip?.replace(/^::ffff:/, "") ?? "";
    try {
        const numeric = ipToLong(clean);
        return RANGES.some(({ start, end }) => numeric >= start && numeric <= end);
    } catch {
        return false;
    }
}

// Middleware
// Blocks any callback request that doesn't originate from a Safaricom IP.
// In development/sandbox we allow through (Daraja sandbox may come from
// non-standard IPs depending on tunnelling setup), but we log the source.
// Important: always return 200 to Daraja even on rejection — a 4xx or 5xx
// causes Daraja to retry indefinitely. We just silently discard forged requests.

export function safaricomOnly(req, res, next) {
    // Trust the rightmost IP set by the proxy (Render, Railway, etc.)
    // app.set("trust proxy", true) is required if behind a reverse proxy.
    const ip = req.ip || req.socket?.remoteAddress || "";

    if (NODE_ENV !== "production") {
        // In dev/sandbox: allow through but log so developers are aware
        logger.info(`[safaricomOnly] ${NODE_ENV} — allowing callback from ${ip}`);
        return next();
    }

    if (!isAllowedIp(ip)) {
        logger.warn(`[safaricomOnly] BLOCKED callback from unknown IP: ${ip}`);
        // Return 200 — we don't want Daraja to think the endpoint is down
        return res.status(200).send("Acknowledged");
    }

    next();
}
