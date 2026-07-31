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
import { orderLimiter, publicLimiter, adminWriteLimiter } from "../middlewares/rateLimiter.js";

const orderRouter = Router();

// Public
orderRouter.get("/track",          publicLimiter,                               trackOrder);

// Authenticated users
orderRouter.post("/",              requireAuth, orderLimiter,                   placeOrder);
orderRouter.get("/",               requireAuth,                                 getOrders);
orderRouter.get("/customers",      requireAuth, requireAdmin,                   getOrderCustomers);
orderRouter.get("/:idOrRef",       requireAuth,                                 getOrder);

// Admin only
orderRouter.patch("/:id/status",   requireAuth, requireAdmin, adminWriteLimiter, updateOrderStatus);

export default orderRouter;
