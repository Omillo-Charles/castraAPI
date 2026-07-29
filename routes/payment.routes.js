import { Router } from "express";
import {
    stkPush,
    stkCallback,
    stkQuery,
    submitManualPayment,
    getPaymentStatus,
} from "../controllers/payment.controller.js";
import { requireAuth } from "../middlewares/requireAuth.js";

const paymentRouter = Router();

// ── Public — Daraja webhook (no auth, called by Safaricom) ───────────────────
paymentRouter.post("/mpesa/callback", stkCallback);

// ── Protected — require authenticated user ───────────────────────────────────
paymentRouter.use(requireAuth);

paymentRouter.post("/stk-push",       stkPush);
paymentRouter.post("/stk-query",      stkQuery);
paymentRouter.post("/manual",         submitManualPayment);
paymentRouter.get("/status/:orderId", getPaymentStatus);

export default paymentRouter;
