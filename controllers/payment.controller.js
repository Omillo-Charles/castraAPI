import prisma from "../database/neon.js";
import mpesa from "../config/mpesa.js";

// Initiate M-Pesa STK Push
// POST /api/v1/payments/stkpush
export async function initiateStkPush(req, res) {
    try {
        const { orderId, phone } = req.body;

        if (!orderId || !phone) {
            return res.status(400).json({ success: false, message: "orderId and phone are required." });
        }

        const order = await prisma.order.findUnique({
            where: { id: orderId },
            include: { payment: true }
        });

        if (!order) {
            return res.status(404).json({ success: false, message: "Order not found." });
        }

        if (order.payment && order.payment.status === "PAID") {
            return res.status(400).json({ success: false, message: "Order is already paid." });
        }

        // Check if M-Pesa is configured (assume it is for now)

        // Call Daraja STK Push
        const stkResponse = await mpesa.initiateSTKPush({
            amount: order.total,
            phone: phone,
            orderId: order.id,
            description: "CastraOrder",
        });

        // Upsert payment record
        await prisma.payment.upsert({
            where: { orderId: order.id },
            update: {
                method: "MPESA_STK",
                status: "PENDING",
                amount: order.total,
                stkPhone: mpesa.normalisePhone(phone),
                checkoutRequestId: stkResponse.CheckoutRequestID,
            },
            create: {
                orderId: order.id,
                method: "MPESA_STK",
                status: "PENDING",
                amount: order.total,
                stkPhone: mpesa.normalisePhone(phone),
                checkoutRequestId: stkResponse.CheckoutRequestID,
            }
        });

        return res.status(200).json({
            success: true,
            message: "STK Push initiated successfully.",
            checkoutRequestId: stkResponse.CheckoutRequestID,
        });

    } catch (error) {
        console.error("[initiateStkPush]", error);
        return res.status(500).json({ success: false, message: error.message || "Server error during STK Push." });
    }
}

// Poll STK Push status
// GET /api/v1/payments/status/:checkoutRequestId
export async function getStkStatus(req, res) {
    try {
        const { checkoutRequestId } = req.params;

        const payment = await prisma.payment.findFirst({
            where: { checkoutRequestId }
        });

        if (!payment) {
            return res.status(404).json({ success: false, message: "Payment record not found." });
        }

        // If we already marked it as PAID or FAILED via callback, just return
        if (payment.status !== "PENDING") {
            return res.status(200).json({ success: true, payment });
        }

        // Otherwise query Daraja
        const statusResponse = await mpesa.querySTKPush(checkoutRequestId);

        // Update payment record based on query result
        const newStatus = Number(statusResponse.ResultCode) === 0 ? "PAID" : "FAILED";
        const updatedPayment = await prisma.payment.update({
            where: { id: payment.id },
            data: {
                status: newStatus,
            }
        });

        return res.status(200).json({ success: true, payment: updatedPayment });

    } catch (error) {
        console.error("[getStkStatus]", error);
        return res.status(500).json({ success: false, message: error.message || "Server error while querying status." });
    }
}

// Admin: manually update payment status after confirming an offline/manual payment.
// PATCH /api/v1/payments/:id/status
export async function updatePaymentStatus(req, res) {
    try {
        const { id } = req.params;
        const { status, mpesaReceiptNumber } = req.body;

        if (!["PENDING", "PAID", "FAILED"].includes(status)) {
            return res.status(400).json({ success: false, message: "status must be PENDING, PAID, or FAILED." });
        }

        const payment = await prisma.payment.findUnique({ where: { id } });
        if (!payment) {
            return res.status(404).json({ success: false, message: "Payment not found." });
        }

        const updatedPayment = await prisma.payment.update({
            where: { id },
            data: {
                status,
                mpesaReceiptNumber: mpesaReceiptNumber?.trim() || payment.mpesaReceiptNumber,
            },
        });

        return res.status(200).json({ success: true, payment: updatedPayment });
    } catch (error) {
        console.error("[updatePaymentStatus]", error);
        return res.status(500).json({ success: false, message: "Server error while updating payment status." });
    }
}

// M-Pesa Callback Endpoint
// POST /payment/mpesa/callback (Usually exposed at root, but can be under /api/v1/payments/callback)
export async function mpesaCallback(req, res) {
    try {
        console.log("[mpesaCallback] Received payload:", JSON.stringify(req.body, null, 2));

        const result = mpesa.parseSTKCallback(req.body);

        if (!result) {
            console.error("[mpesaCallback] Invalid callback payload.");
            return res.status(400).send("Invalid callback payload");
        }

        if (!result.checkoutRequestId) {
            console.error("[mpesaCallback] Missing CheckoutRequestID in callback.");
            return res.status(400).send("Invalid callback payload");
        }

        const payment = await prisma.payment.findFirst({
            where: { checkoutRequestId: result.checkoutRequestId }
        });

        if (!payment) {
            console.error(`[mpesaCallback] Payment record not found for CheckoutRequestID: ${result.checkoutRequestId}`);
            return res.status(200).send("Acknowledged"); // Return 200 so Daraja stops retrying
        }

        const newStatus = result.success ? "PAID" : "FAILED";

        await prisma.payment.update({
            where: { id: payment.id },
            data: {
                status: newStatus,
                mpesaReceiptNumber: result.mpesaReceiptNumber || null,
            }
        });

        console.log(`[mpesaCallback] Payment ${payment.id} marked as ${newStatus}.`);
        return res.status(200).send("Acknowledged");

    } catch (error) {
        console.error("[mpesaCallback] Error processing callback:", error);
        return res.status(500).send("Internal Server Error");
    }
}
