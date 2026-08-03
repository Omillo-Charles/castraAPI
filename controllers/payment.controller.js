import prisma from "../database/neon.js";
import mpesa from "../config/mpesa.js";
import { sendMail } from "../config/resend.js";
import { buildPaymentStatusEmail } from "../utils/emailTemplates.js";
import { FRONTEND_URL } from "../config/env.js";
import { AppError } from "../middlewares/error.js";
import { logger } from "../middlewares/logger.js";

// POST /api/v1/payments/stkpush
export async function initiateStkPush(req, res, next) {
    try {
        const { orderId, phone } = req.body;

        const order = await prisma.order.findUnique({ where: { id: orderId }, include: { payment: true } });
        if (!order) throw new AppError("Order not found.", 404);
        if (order.payment?.status === "PAID") throw new AppError("Order is already paid.", 400);

        const stkResponse = await mpesa.initiateSTKPush({
            amount:      order.total,
            phone,
            orderId:     order.id,
            description: "CastraOrder",
        });

        await prisma.payment.upsert({
            where:  { orderId: order.id },
            update: { method: "MPESA_STK", status: "PENDING", amount: order.total, stkPhone: mpesa.normalisePhone(phone), checkoutRequestId: stkResponse.CheckoutRequestID },
            create: { orderId: order.id, method: "MPESA_STK", status: "PENDING", amount: order.total, stkPhone: mpesa.normalisePhone(phone), checkoutRequestId: stkResponse.CheckoutRequestID },
        });

        return res.status(200).json({
            success: true,
            message: "STK Push initiated successfully.",
            checkoutRequestId: stkResponse.CheckoutRequestID,
        });
    } catch (error) {
        next(error);
    }
}

// GET /api/v1/payments/status/:checkoutRequestId
export async function getStkStatus(req, res, next) {
    try {
        const { checkoutRequestId } = req.params;

        const payment = await prisma.payment.findFirst({ where: { checkoutRequestId } });
        if (!payment) throw new AppError("Payment record not found.", 404);

        if (payment.status !== "PENDING") {
            return res.status(200).json({ success: true, payment });
        }

        const statusResponse = await mpesa.querySTKPush(checkoutRequestId);
        const newStatus      = Number(statusResponse.ResultCode) === 0 ? "PAID" : "FAILED";

        const updatedPayment = await prisma.payment.update({ where: { id: payment.id }, data: { status: newStatus } });
        return res.status(200).json({ success: true, payment: updatedPayment });
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

// POST /api/v1/payments/mpesa/callback
// Safaricom Daraja callback — must always return 200 so Daraja stops retrying.
export async function mpesaCallback(req, res) {
    try {
        // Structural validation
        // Reject payloads that don't match the Daraja STK callback shape.
        // This stops forged requests that happen to have a valid checkoutRequestId
        // from doing anything — they won't even reach the DB.
        const body = req.body;
        if (
            !body?.Body?.stkCallback ||
            typeof body.Body.stkCallback.CheckoutRequestID !== "string" ||
            typeof body.Body.stkCallback.ResultCode === "undefined"
        ) {
            logger.warn("[mpesaCallback] Rejected: invalid payload structure");
            return res.status(200).send("Acknowledged");
        }

        const result = mpesa.parseSTKCallback(body);

        if (!result?.checkoutRequestId) {
            logger.error("[mpesaCallback] Invalid or missing CheckoutRequestID");
            return res.status(200).send("Acknowledged");
        }

        const payment = await prisma.payment.findFirst({ where: { checkoutRequestId: result.checkoutRequestId } });

        if (!payment) {
            logger.error(`[mpesaCallback] No payment for CheckoutRequestID: ${result.checkoutRequestId}`);
            return res.status(200).send("Acknowledged");
        }

        // Idempotency guard
        // Never overwrite a terminal state. If payment is already PAID or FAILED,
        // a replay cannot change it — even from Daraja itself.
        if (payment.status !== "PENDING") {
            logger.info(`[mpesaCallback] Payment ${payment.id} already ${payment.status} — skipping`);
            return res.status(200).send("Acknowledged");
        }

        const newStatus = result.success ? "PAID" : "FAILED";

        await prisma.payment.update({
            where: { id: payment.id },
            data:  { status: newStatus, mpesaReceiptNumber: result.mpesaReceiptNumber || null },
        });

        logger.info(`[mpesaCallback] Payment ${payment.id} → ${newStatus} (IP: ${req.ip})`);
        return res.status(200).send("Acknowledged");
    } catch (error) {
        // Still return 200 — never let Daraja see a 5xx
        logger.error("[mpesaCallback] Unhandled error", error);
        return res.status(200).send("Acknowledged");
    }
}
