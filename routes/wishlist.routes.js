import { Router } from "express";
import {
    getWishlist,
    addToWishlist,
    removeFromWishlist,
    checkWishlisted,
} from "../controllers/wishlist.controller.js";
import { requireAuth } from "../middlewares/requireAuth.js";

const wishlistRouter = Router();

wishlistRouter.use(requireAuth);

wishlistRouter.get("/",                      getWishlist);
wishlistRouter.post("/",                     addToWishlist);
wishlistRouter.delete("/:productId",         removeFromWishlist);
wishlistRouter.get("/check/:productId",      checkWishlisted);

export default wishlistRouter;
