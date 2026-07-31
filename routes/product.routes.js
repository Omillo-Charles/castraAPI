import { Router } from "express";
import { getProducts, getProductById, createProduct, updateProduct, deleteProduct, toggleProductActive } from "../controllers/product.controller.js";
import { requireAuth, requireAdmin } from "../middlewares/requireAuth.js";
import { upload } from "../config/cloudinary.js";
import { cacheResponse, productListKey, productSingleKey, TTL } from "../middlewares/cacher.js";
import { validate, createProductSchema, updateProductSchema } from "../middlewares/validator.js";

const productRouter = Router();

// Public — cached
productRouter.get(
    "/",
    cacheResponse((req) => productListKey(req.query), TTL.PRODUCTS_LIST),
    getProducts
);
productRouter.get(
    "/:id",
    cacheResponse((req) => productSingleKey(req.params.id), TTL.PRODUCT_SINGLE),
    getProductById
);

// Admin only — upload runs before validate so req.body is populated from multipart
productRouter.post(
    "/",
    requireAuth,
    requireAdmin,
    upload.array("images", 5),
    validate(createProductSchema),
    createProduct
);

productRouter.patch(
    "/:id",
    requireAuth,
    requireAdmin,
    upload.array("images", 5),
    validate(updateProductSchema),
    updateProduct
);

productRouter.delete("/:id",       requireAuth, requireAdmin, deleteProduct);
productRouter.patch("/:id/toggle", requireAuth, requireAdmin, toggleProductActive);

export default productRouter;
