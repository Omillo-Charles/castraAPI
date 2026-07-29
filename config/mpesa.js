import axios from "axios";
import {
    MPESA_ENV,
    MPESA_CONSUMER_KEY,
    MPESA_CONSUMER_SECRET,
    MPESA_BUSINESS_SHORT_CODE,
    MPESA_PASSKEY,
    MPESA_CALLBACK_URL,
} from "./env.js";

// Base URLs
const BASE_URL =
    MPESA_ENV === "production"
        ? "https://api.safaricom.co.ke"
        : "https://sandbox.safaricom.co.ke";

// Generate OAuth access token
// Daraja requires a Bearer token on every API call.
// The token expires in 3600 seconds — we cache it to avoid hammering the auth endpoint.
let _cachedToken    = null;
let _tokenExpiresAt = 0;

export async function getMpesaToken() {
    const now = Date.now();
    if (_cachedToken && now < _tokenExpiresAt) return _cachedToken;

    const credentials = Buffer.from(
        `${MPESA_CONSUMER_KEY}:${MPESA_CONSUMER_SECRET}`
    ).toString("base64");

    const res = await axios.get(`${BASE_URL}/oauth/v1/generate?grant_type=client_credentials`, {
        headers: { Authorization: `Basic ${credentials}` },
    });

    _cachedToken    = res.data.access_token;
    _tokenExpiresAt = now + (res.data.expires_in - 60) * 1000; // refresh 60s before expiry

    return _cachedToken;
}

// Generate STK Push timestamp and password
// timestamp: YYYYMMDDHHmmss
// password:  base64(shortCode + passkey + timestamp)
export function getMpesaTimestamp() {
    const d   = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return (
        `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
        `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
    );
}

export function getMpesaPassword(timestamp) {
    const raw = `${MPESA_BUSINESS_SHORT_CODE}${MPESA_PASSKEY}${timestamp}`;
    return Buffer.from(raw).toString("base64");
}

// STK Push (Lipa Na M-Pesa Online)
// Initiates a payment prompt on the customer's phone.
// amount      : integer, KES whole amount
// phone       : customer phone in 254XXXXXXXXX format
// orderId     : used as the AccountReference and passed back in the callback
// description : short description shown on the M-Pesa prompt (max 12 chars)
export async function initiateSTKPush({ amount, phone, orderId, description = "CastraOrder" }) {
    const token     = await getMpesaToken();
    const timestamp = getMpesaTimestamp();
    const password  = getMpesaPassword(timestamp);

    // Normalise phone number → 254XXXXXXXXX
    const normalised = normalisePhone(phone);

    const payload = {
        BusinessShortCode: MPESA_BUSINESS_SHORT_CODE,
        Password:          password,
        Timestamp:         timestamp,
        TransactionType:   "CustomerPayBillOnline",
        Amount:            Math.round(amount),
        PartyA:            normalised,
        PartyB:            MPESA_BUSINESS_SHORT_CODE,
        PhoneNumber:       normalised,
        CallBackURL:       MPESA_CALLBACK_URL,
        AccountReference:  String(orderId).slice(0, 12),
        TransactionDesc:   description.slice(0, 13),
    };

    const res = await axios.post(
        `${BASE_URL}/mpesa/stkpush/v1/processrequest`,
        payload,
        { headers: { Authorization: `Bearer ${token}` } }
    );

    return res.data;
    // Returns: { MerchantRequestID, CheckoutRequestID, ResponseCode, ResponseDescription, CustomerMessage }
}

// STK Push Query (check payment status)
// Used to poll whether the customer completed the payment.
export async function querySTKPush(checkoutRequestId) {
    const token     = await getMpesaToken();
    const timestamp = getMpesaTimestamp();
    const password  = getMpesaPassword(timestamp);

    const res = await axios.post(
        `${BASE_URL}/mpesa/stkpushquery/v1/query`,
        {
            BusinessShortCode: MPESA_BUSINESS_SHORT_CODE,
            Password:          password,
            Timestamp:         timestamp,
            CheckoutRequestID: checkoutRequestId,
        },
        { headers: { Authorization: `Bearer ${token}` } }
    );

    return res.data;
    // ResultCode 0 = success, 1032 = cancelled by user, 1 = insufficient funds etc.
}

// Helpers

// Converts any Kenyan format to 254XXXXXXXXX
// Accepts: 07XXXXXXXX, 7XXXXXXXX, +254XXXXXXXXX, 254XXXXXXXXX
export function normalisePhone(phone) {
    const cleaned = String(phone).replace(/\s+/g, "").replace(/^\+/, "");
    if (cleaned.startsWith("254")) return cleaned;
    if (cleaned.startsWith("0"))   return `254${cleaned.slice(1)}`;
    if (cleaned.startsWith("7") || cleaned.startsWith("1")) return `254${cleaned}`;
    throw new Error(`Invalid Kenyan phone number: ${phone}`);
}

// Parses the Daraja STK callback body to extract the result
export function parseSTKCallback(body) {
    const stk = body?.Body?.stkCallback;
    if (!stk) return null;

    const resultCode = stk.ResultCode;
    const success    = resultCode === 0;

    const items = stk.CallbackMetadata?.Item ?? [];
    const get   = (name) => items.find((i) => i.Name === name)?.Value ?? null;

    return {
        success,
        resultCode,
        resultDesc:          stk.ResultDesc,
        merchantRequestId:   stk.MerchantRequestID,
        checkoutRequestId:   stk.CheckoutRequestID,
        mpesaReceiptNumber:  get("MpesaReceiptNumber"),
        transactionDate:     get("TransactionDate"),
        phoneNumber:         get("PhoneNumber"),
        amount:              get("Amount"),
    };
}
