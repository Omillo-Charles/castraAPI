import process from "node:process";
import { PAYSTACK_ENV } from "../config/env.js";

const apiUrl = process.env.CASTRA_API_URL || "http://localhost:5500/api/v1";
const sessionCookie = process.env.CASTRA_SESSION_COOKIE;

if (PAYSTACK_ENV !== "sandbox") {
    throw new Error("Refusing to run: PAYSTACK_ENV must be 'sandbox'.");
}

if (!sessionCookie) {
    throw new Error("Set CASTRA_SESSION_COOKIE to the guest castra_session cookie before running this test.");
}

const response = await fetch(`${apiUrl}/orders`, {
    method: "POST",
    headers: {
        "Content-Type": "application/json",
        Cookie: `castra_session=${sessionCookie}`,
        "x-castra-test": "paystack-prompt",
    },
    body: JSON.stringify({
        contact: {
            firstName: "Paystack",
            lastName: "Sandbox Test",
            email: process.env.PAYSTACK_TEST_EMAIL || "paystack-sandbox-test@example.com",
            phone: "+254745511354",
        },
        delivery: {
            street: "Sandbox test address",
            city: "Nairobi",
            county: "Nairobi",
            notes: "Automated Paystack sandbox prompt test.",
        },
        payment: {
            method: "paystack-mpesa",
        },
    }),
});

const payload = await response.json().catch(() => null);

if (!response.ok) {
    throw new Error(`Paystack prompt test failed (${response.status}): ${payload?.message || "Unknown error"}`);
}

console.log(JSON.stringify({
    orderRef: payload.order?.ref,
    paymentStatus: payload.payment?.status,
    paystackReference: payload.paystack?.reference,
    authorizationUrl: payload.paystack?.authorizationUrl,
    adminNotificationSuppressed: true,
}, null, 2));
