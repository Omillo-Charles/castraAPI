import { Router } from "express";
import { initiateStkPush, getStkStatus, updatePaymentStatus, mpesaCallback } from "../controllers/payment.controller.js";
import { requireAuth, requireAdmin } from "../middlewares/requireAuth.js";
import { stkLimiter, adminWriteLimiter } from "../middlewares/rateLimiter.js";

const paymentRouter = Router();

// Protected routes
paymentRouter.post("/stkpush",                    requireAuth,               stkLimiter,        initiateStkPush);
paymentRouter.get("/status/:checkoutRequestId",   requireAuth,                                  getStkStatus);
paymentRouter.patch("/:id/status",                requireAuth, requireAdmin, adminWriteLimiter, updatePaymentStatus);

// Public — Safaricom Daraja callback (no rate limit, Daraja must always get through)
paymentRouter.post("/mpesa/callback", mpesaCallback);

export default paymentRouter;
