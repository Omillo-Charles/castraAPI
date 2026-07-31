import { Router } from "express";
import { initiateStkPush, getStkStatus, updatePaymentStatus, mpesaCallback } from "../controllers/payment.controller.js";
import { requireAuth, requireAdmin } from "../middlewares/requireAuth.js";
import { stkLimiter, adminWriteLimiter } from "../middlewares/rateLimiter.js";
import { validate, stkPushSchema, updatePaymentStatusSchema } from "../middlewares/validator.js";

const paymentRouter = Router();

paymentRouter.post("/stkpush",                  requireAuth,               stkLimiter,        validate(stkPushSchema),               initiateStkPush);
paymentRouter.get("/status/:checkoutRequestId", requireAuth,                                                                          getStkStatus);
paymentRouter.patch("/:id/status",              requireAuth, requireAdmin, adminWriteLimiter, validate(updatePaymentStatusSchema),    updatePaymentStatus);

// Daraja callback — no auth, no rate limit, no body validation (Safaricom's format)
paymentRouter.post("/mpesa/callback", mpesaCallback);

export default paymentRouter;
