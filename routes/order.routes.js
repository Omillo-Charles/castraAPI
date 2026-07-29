import { Router } from "express";
import {
    placeOrder,
    getOrders,
    getOrder,
    getOrderCustomers,
    trackOrder,
    updateOrderStatus,
} from "../controllers/order.controller.js";
import { requireAuth, requireAdmin } from "../middlewares/requireAuth.js";

const orderRouter = Router();

// ── Public ────────────────────────────────────────────────────────────────────
// Track by order ref or phone — no login required
orderRouter.get("/track", trackOrder);

// ── Authenticated users ───────────────────────────────────────────────────────
orderRouter.post("/",            requireAuth,               placeOrder);
orderRouter.get("/",             requireAuth,               getOrders);
orderRouter.get("/customers",    requireAuth, requireAdmin, getOrderCustomers);
orderRouter.get("/:idOrRef",     requireAuth,               getOrder);

// ── Admin only ────────────────────────────────────────────────────────────────
orderRouter.patch("/:id/status", requireAuth, requireAdmin, updateOrderStatus);

export default orderRouter;
