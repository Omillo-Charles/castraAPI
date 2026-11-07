import crypto from "crypto";
import axios from "axios";
import {
    PAYSTACK_SECRET_KEY,
    PAYSTACK_WEBHOOK_SIGNING_SECRET,
    PAYSTACK_WEBHOOK_URL,
} from "./env.js";

const BASE_URL = "https://api.paystack.co";
const REQUEST_TIMEOUT_MS = 15000;
const DEFAULT_CURRENCY = "KES";
const WEBHOOK_TOLERANCE_SECONDS = 300;

// Paystack secret keys must remain on the server. Fail explicitly instead of
// sending an unauthenticated request that would produce a misleading error.
function requireSecret() {
    if (!PAYSTACK_SECRET_KEY) {
        throw new Error("Paystack secret key is not configured.");
    }
    return PAYSTACK_SECRET_KEY;
}

// Extract the useful message from Paystack's standard error response.
function pickPaystackMessage(data) {
    if (!data || typeof data !== "object") return null;
    return typeof data.message === "string" ? data.message : null;
}

// Convert Axios, timeout, and Paystack API errors into safe operational errors.
// The secret key and authorization headers are never included in the message.
export function getPaystackErrorMessage(error, fallback = "Paystack request failed") {
    if (!axios.isAxiosError(error)) {
        return error?.message || fallback;
    }

    if (error.code === "ECONNABORTED" || error.code === "ECONNRESET") {
        return `${fallback}: Paystack did not respond in time. Please try again.`;
    }

    const status = error.response?.status;
    const message = pickPaystackMessage(error.response?.data) || error.message || fallback;
    return `${fallback}${status ? ` (${status})` : ""}: ${message}`;
}

// Build the authentication headers for server-to-server Paystack requests.
function paystackHeaders() {
    return {
        Authorization: `Bearer ${requireSecret()}`,
        "Content-Type": "application/json",
    };
}

// Shared timeout and header configuration for every Paystack API call.
function requestConfig() {
    return {
        headers: paystackHeaders(),
        timeout: REQUEST_TIMEOUT_MS,
    };
}

// Application totals are stored as whole Kenyan shillings.
function assertPositiveAmount(amount) {
    if (!Number.isSafeInteger(amount) || amount <= 0) {
        throw new Error("Paystack amount must be a positive whole number of KES.");
    }
}

// Paystack expects KES in cents while the application stores whole shillings.
export function toPaystackSubunit(amountKes) {
    assertPositiveAmount(amountKes);
    const amount = amountKes * 100;
    if (!Number.isSafeInteger(amount)) {
        throw new Error("Paystack amount exceeds the supported safe integer range.");
    }
    return amount;
}

// Paystack requires a customer email when initializing a transaction.
function assertEmail(email) {
    if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new Error("A valid customer email is required for Paystack.");
    }
}

// Paystack references may contain only alphanumeric characters and . = - _.
function assertReference(reference) {
    if (
        typeof reference !== "string" ||
        reference.length < 1 ||
        reference.length > 100 ||
        !/^[a-zA-Z0-9._=-]+$/.test(reference)
    ) {
        throw new Error("Paystack reference contains invalid characters.");
    }
}

// Ensure a successful HTTP response also contains Paystack's success payload.
function parseResponse(response, fallback) {
    if (!response?.data?.status || !response.data.data) {
        throw new Error(response?.data?.message || fallback);
    }
    return response.data.data;
}

// Initialize a hosted Paystack checkout.
// The returned authorization URL is safe to send to the frontend for redirect.
export async function initializeTransaction({
    email,
    amount,
    reference,
    firstName,
    lastName,
    phone,
    metadata = {},
    channels = ["mobile_money"],
    callbackUrl,
    currency = DEFAULT_CURRENCY,
}) {
    assertEmail(email);
    assertPositiveAmount(amount);
    assertReference(reference);

    if (currency !== "KES") {
        throw new Error("Paystack M-Pesa STK transactions must use KES.");
    }

    const payload = {
        email: email.trim().toLowerCase(),
        amount: toPaystackSubunit(amount),
        currency,
        reference,
        channels,
        ...(callbackUrl ? { callback_url: callbackUrl } : {}),
        metadata: {
            ...metadata,
            ...(firstName ? { first_name: firstName } : {}),
            ...(lastName ? { last_name: lastName } : {}),
            ...(phone ? { phone } : {}),
        },
    };

    try {
        const response = await axios.post(
            `${BASE_URL}/transaction/initialize`,
            payload,
            requestConfig()
        );
        return parseResponse(response, "Paystack transaction initialization failed");
    } catch (error) {
        throw new Error(getPaystackErrorMessage(error, "Paystack transaction initialization failed"));
    }
}

// Verify the transaction server-side before marking an order as paid.
export async function verifyTransaction(reference) {
    assertReference(reference);

    try {
        const response = await axios.get(
            `${BASE_URL}/transaction/verify/${encodeURIComponent(reference)}`,
            requestConfig()
        );
        return parseResponse(response, "Paystack transaction verification failed");
    } catch (error) {
        throw new Error(getPaystackErrorMessage(error, "Paystack transaction verification failed"));
    }
}

// Verify both the Paystack status and the exact expected amount in KES.
// A successful status with a mismatched amount must never deliver the order.
export function isSuccessfulTransaction(transaction, expectedAmountKes) {
    if (!transaction || transaction.status !== "success" || transaction.currency !== "KES") {
        return false;
    }

    if (expectedAmountKes === undefined) return true;
    assertPositiveAmount(expectedAmountKes);
    return transaction.amount === toPaystackSubunit(expectedAmountKes);
}

// Compare HMAC values without leaking timing information.
function timingSafeEqualHex(left, right) {
    if (!/^[a-f0-9]{128}$/i.test(left) || !/^[a-f0-9]{128}$/i.test(right)) {
        return false;
    }
    return crypto.timingSafeEqual(
        Buffer.from(left, "hex"),
        Buffer.from(right, "hex")
    );
}

// Prefer Paystack's webhook signing secret; fall back to the secret key for
// legacy webhook signatures when no dedicated signing secret is configured.
function getSignatureSecret() {
    return PAYSTACK_WEBHOOK_SIGNING_SECRET || PAYSTACK_SECRET_KEY;
}

// Validate the raw webhook body before JSON parsing or business processing.
// Timestamped signatures are replay-protected with a five-minute tolerance.
export function verifyWebhookSignature(rawBody, signature, nowSeconds = Math.floor(Date.now() / 1000)) {
    const secret = getSignatureSecret();
    if (!secret || !Buffer.isBuffer(rawBody) || typeof signature !== "string") {
        return false;
    }

    // Signed webhooks use: t=<unix timestamp>,v1=<key id>:<hmac>,...
    if (signature.includes("t=")) {
        const parts = signature.split(",");
        const timestamp = parts.find((part) => part.startsWith("t="))?.slice(2);
        const signatures = parts
            .filter((part) => part.startsWith("v1="))
            .map((part) => part.slice(3).split(":").pop())
            .filter(Boolean);

        const timestampNumber = Number(timestamp);
        if (
            !Number.isInteger(timestampNumber) ||
            Math.abs(nowSeconds - timestampNumber) > WEBHOOK_TOLERANCE_SECONDS
        ) {
            return false;
        }

        const expected = crypto
            .createHmac("sha512", secret)
            .update(`${timestamp}.${rawBody.toString("utf8")}`)
            .digest("hex");

        return signatures.some((candidate) => timingSafeEqualHex(expected, candidate));
    }

    // Legacy x-paystack-signature format: HMAC SHA512 of the raw body.
    const expected = crypto.createHmac("sha512", secret).update(rawBody).digest("hex");
    return timingSafeEqualHex(expected, signature);
}

// Build a stable idempotency key for storing processed webhook events.
export function getWebhookEventKey(event) {
    const id = event?.data?.id ?? event?.data?.reference;
    return id ? `${event?.event || "unknown"}:${id}` : null;
}

const paystack = {
    getPaystackErrorMessage,
    toPaystackSubunit,
    initializeTransaction,
    verifyTransaction,
    isSuccessfulTransaction,
    verifyWebhookSignature,
    getWebhookEventKey,
    webhookUrl: PAYSTACK_WEBHOOK_URL,
};

export default paystack;