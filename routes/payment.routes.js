import { Router } from "express";
import { initiateStkPush, getStkStatus, updatePaymentStatus, mpesaCallback } from "../controllers/payment.controller.js";
import { requireAuth, requireAdmin } from "../middlewares/requireAuth.js";

const paymentRouter = Router();

// Protected routes (require user to be logged in to initiate payment or check status)
paymentRouter.post("/stkpush", requireAuth, initiateStkPush);
paymentRouter.get("/status/:checkoutRequestId", requireAuth, getStkStatus);
paymentRouter.patch("/:id/status", requireAuth, requireAdmin, updatePaymentStatus);

// Public route for Safaricom Daraja callback
paymentRouter.post("/mpesa/callback", mpesaCallback);

export default paymentRouter;
