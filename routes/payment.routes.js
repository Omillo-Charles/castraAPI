import { Router } from "express";
import {
    initializePaystackPayment,
    verifyPaystackPayment,
    paystackWebhook,
    updatePaymentStatus,
} from "../controllers/payment.controller.js";
import { requireAuth, requireAdmin } from "../middlewares/requireAuth.js";
import { paystackLimiter, adminWriteLimiter } from "../middlewares/rateLimiter.js";
import { validate, paystackInitializeSchema, updatePaymentStatusSchema } from "../middlewares/validator.js";
import { resolveCart } from "../middlewares/resolveCart.js";

const paymentRouter = Router();

paymentRouter.post("/paystack/initialize",       requireAuth, paystackLimiter, validate(paystackInitializeSchema), initializePaystackPayment);
paymentRouter.get("/paystack/verify/:reference", resolveCart, verifyPaystackPayment);
paymentRouter.patch("/:id/status",              requireAuth, requireAdmin, adminWriteLimiter, validate(updatePaymentStatusSchema),    updatePaymentStatus);

paymentRouter.post("/paystack/webhook", paystackWebhook);

export default paymentRouter;
