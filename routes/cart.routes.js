import { Router } from "express";
import { getCart, addItem, updateItem, removeItem, clearCart, applyCoupon } from "../controllers/cart.controller.js";
import { requireAuth } from "../middlewares/requireAuth.js";
import { validate, addCartItemSchema, updateCartItemSchema, applyCouponSchema } from "../middlewares/validator.js";

const cartRouter = Router();

cartRouter.use(requireAuth);

cartRouter.get("/",                    getCart);
cartRouter.post("/items",              validate(addCartItemSchema),    addItem);
cartRouter.put("/items/:productId",    validate(updateCartItemSchema), updateItem);
cartRouter.delete("/items/:productId", removeItem);
cartRouter.delete("/",                 clearCart);
cartRouter.post("/coupon",             validate(applyCouponSchema),    applyCoupon);

export default cartRouter;
