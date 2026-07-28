import { Router } from "express";
import {
    getCart,
    addItem,
    updateItem,
    removeItem,
    clearCart,
    applyCoupon,
} from "../controllers/cart.controller.js";
import { requireAuth } from "../middlewares/requireAuth.js";

const cartRouter = Router();

// All cart routes require authentication
cartRouter.use(requireAuth);

cartRouter.get("/",                    getCart);
cartRouter.post("/items",              addItem);
cartRouter.put("/items/:productId",    updateItem);
cartRouter.delete("/items/:productId", removeItem);
cartRouter.delete("/",                 clearCart);
cartRouter.post("/coupon",             applyCoupon);

export default cartRouter;
