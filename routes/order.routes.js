import { Router } from "express";
import { placeOrder, getOrders, getOrder, getOrderCustomers, trackOrder, updateOrderStatus } from "../controllers/order.controller.js";
import { requireAuth, requireAdmin } from "../middlewares/requireAuth.js";
import { resolveCart } from "../middlewares/resolveCart.js";
import { orderLimiter, publicLimiter, adminWriteLimiter } from "../middlewares/rateLimiter.js";
import { validate, placeOrderSchema, updateOrderStatusSchema } from "../middlewares/validator.js";

const orderRouter = Router();

// Public
orderRouter.get("/track", publicLimiter, trackOrder);

// Order placement — open to users and guests
// resolveCart sets req.cartOwner to either the authenticated user or the guest
// session, so placeOrder works for both without requiring a login.
orderRouter.post("/", resolveCart, orderLimiter, validate(placeOrderSchema), placeOrder);

// Authenticated — users viewing their own orders
orderRouter.get("/",          requireAuth,               getOrders);
orderRouter.get("/customers", requireAuth, requireAdmin, getOrderCustomers);
orderRouter.get("/:idOrRef",  requireAuth,               getOrder);

// Admin only 
orderRouter.patch("/:id/status", requireAuth, requireAdmin, adminWriteLimiter, validate(updateOrderStatusSchema), updateOrderStatus);

export default orderRouter;
