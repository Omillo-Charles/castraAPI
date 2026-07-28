import { Router } from "express";
import {
    getProducts,
    getProductById,
    createProduct,
    updateProduct,
    deleteProduct,
    toggleProductActive,
} from "../controllers/product.controller.js";
import { requireAuth, requireAdmin } from "../middlewares/requireAuth.js";
import { upload } from "../config/cloudinary.js";

const productRouter = Router();

// Public
productRouter.get("/",    getProducts);
productRouter.get("/:id", getProductById);

// Admin only
productRouter.post(
    "/",
    requireAuth,
    requireAdmin,
    upload.array("images", 5), // up to 5 images per product
    createProduct
);

productRouter.patch(
    "/:id",
    requireAuth,
    requireAdmin,
    upload.array("images", 5),
    updateProduct
);

productRouter.delete("/:id",        requireAuth, requireAdmin, deleteProduct);
productRouter.patch("/:id/toggle",  requireAuth, requireAdmin, toggleProductActive);

export default productRouter;
