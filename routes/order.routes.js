import { Router } from "express";
import { placeOrder, getOrders, getOrder, getOrderCustomers, trackOrder, updateOrderStatus } from "../controllers/order.controller.js";
import { requireAuth, requireAdmin } from "../middlewares/requireAuth.js";
import { orderLimiter, publicLimiter, adminWriteLimiter } from "../middlewares/rateLimiter.js";
import { validate, placeOrderSchema, updateOrderStatusSchema } from "../middlewares/validator.js";

const orderRouter = Router();

// Public
orderRouter.get("/track",        publicLimiter,                                                            trackOrder);

// Authenticated
orderRouter.post("/",            requireAuth, orderLimiter, validate(placeOrderSchema),                    placeOrder);
orderRouter.get("/",             requireAuth,                                                               getOrders);
orderRouter.get("/customers",    requireAuth, requireAdmin,                                                 getOrderCustomers);
orderRouter.get("/:idOrRef",     requireAuth,                                                               getOrder);

// Admin only
orderRouter.patch("/:id/status", requireAuth, requireAdmin, adminWriteLimiter, validate(updateOrderStatusSchema), updateOrderStatus);

export default orderRouter;
