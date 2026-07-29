import prisma from "../database/neon.js";
import {
    initiateSTKPush,
    querySTKPush,
    parseSTKCallback,
    normalisePhone,
} from "../config/mpesa.js";

// POST /api/v1/payments/stk-push
// Initiates an M-Pesa STK push for a given order.
// Body: { orderId, phone }
// The order must belong to the authenticated user and have a PENDING payment.
export async function stkPush(req, res) {
    try {
        const { orderId, phone } = req.body;

        if (!orderId || !phone) {
            return res.status(400).json({
                success: false,
                message: "orderId and phone are required.",
            });
        }

        // Verify the order exists and belongs to the user
        const order = await prisma.order.findFirst({
            where:   { id: orderId, userId: req.user.id },
            include: { payment: true },
        });

        if (!order) {
            return res.status(404).json({ success: false, message: "Order not found." });
        }

        if (order.payment?.status === "PAID") {
            return res.status(400).json({ success: false, message: "This order has already been paid." });
        }

        // Normalise phone before sending
        let normalisedPhone;
        try {
            normalisedPhone = normalisePhone(phone);
        } catch {
            return res.status(400).json({ success: false, message: "Invalid phone number format." });
        }

        // Initiate STK push via Daraja
        const stkRes = await initiateSTKPush({
            amount:      order.total,
            phone:       normalisedPhone,
            orderId:     order.id,
            description: "CastraOrder",
        });

        // Daraja returns ResponseCode "0" (string) for a successful initiation
        if (stkRes.ResponseCode !== "0") {
            return res.status(502).json({
                success: false,
                message: stkRes.ResponseDescription || "M-Pesa initiation failed.",
            });
        }

        // Upsert the payment record with STK details
        await prisma.payment.upsert({
            where:  { orderId },
            update: {
                method:            "MPESA_STK",
                stkPhone:          normalisedPhone,
                checkoutRequestId: stkRes.CheckoutRequestID,
                status:            "PENDING",
            },
            create: {
                orderId,
                method:            "MPESA_STK",
                amount:            order.total,
                stkPhone:          normalisedPhone,
                checkoutRequestId: stkRes.CheckoutRequestID,
                status:            "PENDING",
            },
        });

        return res.status(200).json({
            success:           true,
            message:           stkRes.CustomerMessage,
            checkoutRequestId: stkRes.CheckoutRequestID,
            merchantRequestId: stkRes.MerchantRequestID,
        });
    } catch (error) {
        console.error("[stkPush]", error);
        return res.status(500).json({ success: false, message: "Server error." });
    }
}

// POST /api/v1/payments/stk-callback
// Daraja webhook — called by Safaricom when the customer completes or cancels.
// No auth — this is a public endpoint called by Safaricom's servers.
export async function stkCallback(req, res) {
    // Always acknowledge Daraja immediately, even if we fail internally
    res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });

    try {
        const parsed = parseSTKCallback(req.body);
        if (!parsed) {
            console.error("[stkCallback] Could not parse callback body:", req.body);
            return;
        }

        const payment = await prisma.payment.findFirst({
            where: { checkoutRequestId: parsed.checkoutRequestId },
        });

        if (!payment) {
            console.error("[stkCallback] No payment found for CheckoutRequestID:", parsed.checkoutRequestId);
            return;
        }

        if (parsed.success) {
            // Payment completed — update payment and confirm the order
            await prisma.$transaction([
                prisma.payment.update({
                    where: { id: payment.id },
                    data:  {
                        status:             "PAID",
                        mpesaReceiptNumber: parsed.mpesaReceiptNumber,
                    },
                }),
                prisma.order.update({
                    where: { id: payment.orderId },
                    data:  { status: "CONFIRMED" },
                }),
            ]);
            console.log(`[stkCallback] Payment confirmed: ${parsed.mpesaReceiptNumber} for order ${payment.orderId}`);
        } else {
            // Payment failed or was cancelled
            await prisma.payment.update({
                where: { id: payment.id },
                data:  { status: "FAILED" },
            });
            console.log(`[stkCallback] Payment failed (code ${parsed.resultCode}): ${parsed.resultDesc}`);
        }
    } catch (error) {
        console.error("[stkCallback] Internal error:", error);
    }
}

// POST /api/v1/payments/stk-query
// Frontend polls this after placing an STK push order to check if payment completed.
// Body: { checkoutRequestId }
export async function stkQuery(req, res) {
    try {
        const { checkoutRequestId } = req.body;

        if (!checkoutRequestId) {
            return res.status(400).json({ success: false, message: "checkoutRequestId is required." });
        }

        // First check our own DB — callback may have already updated it
        const payment = await prisma.payment.findFirst({
            where: { checkoutRequestId },
        });

        if (payment?.status === "PAID") {
            return res.status(200).json({ success: true, status: "PAID", message: "Payment confirmed." });
        }

        if (payment?.status === "FAILED") {
            return res.status(200).json({ success: false, status: "FAILED", message: "Payment was not completed." });
        }

        // Still PENDING — query Daraja directly
        const darajaRes = await querySTKPush(checkoutRequestId);

        // ResultCode 0 = paid, 1032 = cancelled, others = pending or failed
        if (darajaRes.ResultCode === "0" || darajaRes.ResultCode === 0) {
            if (payment) {
                await prisma.payment.update({
                    where: { id: payment.id },
                    data:  { status: "PAID", mpesaReceiptNumber: darajaRes.ResultDesc },
                });
            }
            return res.status(200).json({ success: true, status: "PAID", message: "Payment confirmed." });
        }

        return res.status(200).json({
            success: false,
            status:  "PENDING",
            message: darajaRes.ResultDesc || "Payment not yet confirmed.",
        });
    } catch (error) {
        console.error("[stkQuery]", error);
        return res.status(500).json({ success: false, message: "Server error." });
    }
}

// POST /api/v1/payments/manual
// For Paybill payments — customer provides the M-Pesa reference after paying manually.
// Body: { orderId, mpesaRef }
export async function submitManualPayment(req, res) {
    try {
        const { orderId, mpesaRef } = req.body;

        if (!orderId || !mpesaRef) {
            return res.status(400).json({ success: false, message: "orderId and mpesaRef are required." });
        }

        const order = await prisma.order.findFirst({
            where:   { id: orderId, userId: req.user.id },
            include: { payment: true },
        });

        if (!order) {
            return res.status(404).json({ success: false, message: "Order not found." });
        }

        if (order.payment?.status === "PAID") {
            return res.status(400).json({ success: false, message: "This order has already been paid." });
        }

        // Upsert payment record — admin will verify the ref manually or via C2B callback
        const payment = await prisma.payment.upsert({
            where:  { orderId },
            update: {
                method:    "MPESA_PAYBILL",
                mpesaRef,
                status:    "PENDING", // stays PENDING until admin/C2B confirms
            },
            create: {
                orderId,
                method:    "MPESA_PAYBILL",
                amount:    order.total,
                mpesaRef,
                status:    "PENDING",
            },
        });

        return res.status(200).json({
            success: true,
            message: "Payment reference received. Your order is being confirmed.",
            payment: { id: payment.id, status: payment.status, mpesaRef: payment.mpesaRef },
        });
    } catch (error) {
        console.error("[submitManualPayment]", error);
        return res.status(500).json({ success: false, message: "Server error." });
    }
}

// GET /api/v1/payments/status/:orderId
// Returns the payment status for a given order (user must own the order).
export async function getPaymentStatus(req, res) {
    try {
        const { orderId } = req.params;

        const order = await prisma.order.findFirst({
            where:   { id: orderId, userId: req.user.id },
            include: { payment: true },
        });

        if (!order) {
            return res.status(404).json({ success: false, message: "Order not found." });
        }

        if (!order.payment) {
            return res.status(200).json({ success: true, status: "NO_PAYMENT", message: "No payment recorded yet." });
        }

        return res.status(200).json({
            success: true,
            status:  order.payment.status,
            method:  order.payment.method,
            ref:     order.payment.mpesaRef ?? order.payment.mpesaReceiptNumber ?? null,
        });
    } catch (error) {
        console.error("[getPaymentStatus]", error);
        return res.status(500).json({ success: false, message: "Server error." });
    }
}
