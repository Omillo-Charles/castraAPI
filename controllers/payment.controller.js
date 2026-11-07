import prisma from "../database/neon.js";
import paystack from "../config/paystack.js";
import { sendMail } from "../config/resend.js";
import { buildPaymentStatusEmail } from "../utils/emailTemplates.js";
import { FRONTEND_URL } from "../config/env.js";
import { AppError } from "../middlewares/error.js";
import { logger } from "../middlewares/logger.js";

// POST /api/v1/payments/paystack/initialize
export async function initializePaystackPayment(req, res, next) {
    try {
        const { orderId } = req.body;
        const order = await prisma.order.findFirst({
            where: { id: orderId, userId: req.user.id },
            include: { payment: true },
        });

        if (!order) throw new AppError("Order not found.", 404);
        if (!order.email) throw new AppError("An email address is required for Paystack.", 400);
        if (order.payment?.status === "PAID") throw new AppError("Order is already paid.", 400);

        const reference = order.payment?.paystackReference || `${order.ref}-PAYSTACK`;
        const checkout = await paystack.initializeTransaction({
            email: order.email,
            amount: order.total,
            reference,
            firstName: order.firstName,
            lastName: order.lastName,
            phone: order.phone,
            callbackUrl: `${FRONTEND_URL}/checkout?payment=paystack&reference=${encodeURIComponent(reference)}`,
            metadata: { order_id: order.id, order_ref: order.ref },
        });

        const payment = await prisma.payment.upsert({
            where: { orderId: order.id },
            update: {
                method: "PAYSTACK_MPESA_STK",
                status: "PENDING",
                amount: order.total,
                paystackReference: checkout.reference || reference,
                paystackAccessCode: checkout.access_code ?? null,
                paystackAuthorizationUrl: checkout.authorization_url ?? null,
                paystackCurrency: "KES",
            },
            create: {
                orderId: order.id,
                method: "PAYSTACK_MPESA_STK",
                status: "PENDING",
                amount: order.total,
                paystackReference: checkout.reference || reference,
                paystackAccessCode: checkout.access_code ?? null,
                paystackAuthorizationUrl: checkout.authorization_url ?? null,
                paystackCurrency: "KES",
            },
        });

        return res.status(200).json({
            success: true,
            payment: {
                id: payment.id,
                reference: payment.paystackReference,
                authorizationUrl: payment.paystackAuthorizationUrl,
                accessCode: payment.paystackAccessCode,
            },
        });
    } catch (error) {
        next(error);
    }
}

// GET /api/v1/payments/paystack/verify/:reference
export async function verifyPaystackPayment(req, res, next) {
    try {
        const { reference } = req.params;
        const payment = await prisma.payment.findUnique({
            where: { paystackReference: reference },
            include: { order: true },
        });

        const owner = req.cartOwner;
        const ownsOrder = owner?.type === "user"
            ? payment?.order.userId === owner.userId
            : owner?.type === "guest"
                && payment?.order.userId === null
                && payment?.order.sessionId === owner.sessionId;

        if (!payment || !ownsOrder) throw new AppError("Payment not found.", 404);
        if (payment.status === "PAID") return res.status(200).json({ success: true, paid: true, payment });

        const transaction = await paystack.verifyTransaction(reference);
        if (!paystack.isSuccessfulTransaction(transaction, payment.amount)) {
            return res.status(200).json({ success: true, paid: false, status: transaction.status });
        }

        const updatedPayment = await prisma.payment.update({
            where: { id: payment.id },
            data: {
                status: "PAID",
                paystackTransactionId: transaction.id ?? null,
                paystackChannel: transaction.channel ?? null,
                paystackGatewayResponse: transaction.gateway_response ?? null,
                paystackCurrency: transaction.currency ?? "KES",
                paystackPaidAt: transaction.paid_at ? new Date(transaction.paid_at) : new Date(),
            },
        });

        return res.status(200).json({ success: true, paid: true, payment: updatedPayment });
    } catch (error) {
        next(error);
    }
}

// POST /api/v1/payments/paystack/webhook
export async function paystackWebhook(req, res, next) {
    const rawBody = req.rawBody;
    const signature = req.get("paystack-signature") || req.get("x-paystack-signature");

    if (!paystack.verifyWebhookSignature(rawBody, signature)) {
        return res.status(401).json({ success: false, message: "Invalid webhook signature." });
    }

    let event;
    try {
        event = JSON.parse(rawBody.toString("utf8"));
    } catch (error) {
        logger.warn("[paystackWebhook] Invalid JSON payload", error);
        return res.status(400).json({ success: false, message: "Invalid webhook payload." });
    }

    const eventKey = paystack.getWebhookEventKey(event);
    if (!eventKey) return res.status(400).json({ success: false, message: "Webhook event has no identifier." });

    try {
        await prisma.paystackWebhookEvent.create({
            data: {
                eventKey,
                event: event.event || "unknown",
                reference: event.data?.reference ?? null,
                transactionId: Number.isInteger(event.data?.id) ? event.data.id : null,
                payload: event,
            },
        });
    } catch (error) {
        if (error?.code === "P2002") return res.status(200).json({ success: true, duplicate: true });
        return next(error);
    }

    if (event.event !== "charge.success" || typeof event.data?.reference !== "string") {
        return res.status(200).json({ success: true, ignored: true });
    }

    try {
        const payment = await prisma.payment.findUnique({
            where: { paystackReference: event.data.reference },
        });
        if (!payment || payment.status !== "PENDING") {
            return res.status(200).json({ success: true, processed: false });
        }

        const transaction = await paystack.verifyTransaction(event.data.reference);
        if (!paystack.isSuccessfulTransaction(transaction, payment.amount)) {
            logger.warn(`[paystackWebhook] Verification failed for ${event.data.reference}`);
            return res.status(200).json({ success: true, processed: false });
        }

        await prisma.payment.update({
            where: { id: payment.id },
            data: {
                status: "PAID",
                paystackTransactionId: transaction.id ?? null,
                paystackChannel: transaction.channel ?? null,
                paystackGatewayResponse: transaction.gateway_response ?? null,
                paystackCurrency: transaction.currency ?? "KES",
                paystackPaidAt: transaction.paid_at ? new Date(transaction.paid_at) : new Date(),
            },
        });

        return res.status(200).json({ success: true, processed: true });
    } catch (error) {
        next(error);
    }
}

// PATCH /api/v1/payments/:id/status
export async function updatePaymentStatus(req, res, next) {
    try {
        const { id }                     = req.params;
        const { status, mpesaReceiptNumber } = req.body;

        const payment = await prisma.payment.findUnique({ where: { id } });
        if (!payment) throw new AppError("Payment not found.", 404);

        const updatedPayment = await prisma.payment.update({
            where: { id },
            data:  { status, mpesaReceiptNumber: mpesaReceiptNumber?.trim() || payment.mpesaReceiptNumber },
        });

        // Notify customer — non-fatal fire-and-forget
        const order = await prisma.order.findUnique({
            where:  { id: payment.orderId },
            select: {
                ref: true, firstName: true, email: true, total: true,
                items: { select: { name: true, qty: true, price: true, product: { select: { images: true } } } },
            },
        });

        if (order?.email) {
            sendMail({
                to: order.email,
                ...buildPaymentStatusEmail({
                    customerName:  order.firstName,
                    orderId:       order.ref,
                    paymentStatus: status,
                    receiptNumber: updatedPayment.mpesaReceiptNumber ?? "",
                    items:         order.items.map((i) => ({
                        name:     i.name,
                        quantity: i.qty,
                        price:    i.price,
                        image:    i.product?.images?.[0] ?? null,
                    })),
                    total:    order.total,
                    orderUrl: `${FRONTEND_URL}/track-order?q=${order.ref}`,
                }),
            }).catch((e) => logger.error("[updatePaymentStatus] email failed", e));
        }

        return res.status(200).json({ success: true, payment: updatedPayment });
    } catch (error) {
        next(error);
    }
}
