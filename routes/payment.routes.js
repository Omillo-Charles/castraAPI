import { Router } from "express";
import { initiateStkPush, getStkStatus, updatePaymentStatus, mpesaCallback } from "../controllers/payment.controller.js";
import { requireAuth, requireAdmin } from "../middlewares/requireAuth.js";
import { stkLimiter, adminWriteLimiter } from "../middlewares/rateLimiter.js";
import { validate, stkPushSchema, updatePaymentStatusSchema } from "../middlewares/validator.js";
import { safaricomOnly } from "../middlewares/safaricomOnly.js";

const paymentRouter = Router();

paymentRouter.post("/stkpush",                  requireAuth,               stkLimiter,        validate(stkPushSchema),               initiateStkPush);
paymentRouter.get("/status/:checkoutRequestId", requireAuth,                                                                          getStkStatus);
paymentRouter.patch("/:id/status",              requireAuth, requireAdmin, adminWriteLimiter, validate(updatePaymentStatusSchema),    updatePaymentStatus);

// Daraja callback — IP-allowlisted to Safaricom ranges only,
// no auth (Daraja doesn't send tokens), no rate limit (Daraja must always reach us).
paymentRouter.post("/mpesa/callback", safaricomOnly, mpesaCallback);

export default paymentRouter;
