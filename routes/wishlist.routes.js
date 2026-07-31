import { Router } from "express";
import { getWishlist, addToWishlist, removeFromWishlist, checkWishlisted } from "../controllers/wishlist.controller.js";
import { requireAuth } from "../middlewares/requireAuth.js";
import { validate, addWishlistSchema } from "../middlewares/validator.js";

const wishlistRouter = Router();

wishlistRouter.use(requireAuth);

wishlistRouter.get("/",                 getWishlist);
wishlistRouter.post("/",                validate(addWishlistSchema), addToWishlist);
wishlistRouter.delete("/:productId",    removeFromWishlist);
wishlistRouter.get("/check/:productId", checkWishlisted);

export default wishlistRouter;
