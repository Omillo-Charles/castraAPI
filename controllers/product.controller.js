import prisma from "../database/neon.js";
import { uploadToCloudinary, deleteFromCloudinary } from "../config/cloudinary.js";
import { invalidateProducts } from "../middlewares/cacher.js";

// Extract Cloudinary public_id from a secure URL
// e.g. "https://res.cloudinary.com/demo/image/upload/v123/castra/products/abc.webp"
// → "castra/products/abc"
function publicIdFromUrl(url) {
    try {
        const parts = url.split("/upload/");
        if (parts.length < 2) return null;
        // Remove version segment (v12345/) if present, then strip extension
        const withoutVersion = parts[1].replace(/^v\d+\//, "");
        return withoutVersion.replace(/\.[^.]+$/, "");
    } catch {
        return null;
    }
}

// GET /api/v1/products
// Public — supports ?category=kitchenware, ?page=1, ?limit=8, ?sort=price-asc
export async function getProducts(req, res) {
    try {
        const { category, page = "1", limit = "8", sort, search } = req.query;

        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.min(50, Math.max(1, parseInt(limit)));
        const skip = (pageNum - 1) * limitNum;

        const where = { active: true };
        if (category) {
            const slugified = category.toLowerCase().replace(/\s+/g, "-");
            where.OR = [
                { category: { equals: category, mode: "insensitive" } },
                { slug: { equals: category, mode: "insensitive" } },
                { slug: { equals: slugified, mode: "insensitive" } },
            ];
        }
        if (search) {
            where.name = { contains: search, mode: "insensitive" };
        }

        const orderBy = sort === "price-asc" ? { price: "asc" }
            : sort === "price-desc" ? { price: "desc" }
                : { createdAt: "desc" };

        const [products, total] = await Promise.all([
            prisma.product.findMany({ where, orderBy, skip, take: limitNum }),
            prisma.product.count({ where }),
        ]);

        return res.status(200).json({
            success: true,
            products,
            pagination: {
                total,
                page: pageNum,
                limit: limitNum,
                totalPages: Math.ceil(total / limitNum),
            },
        });
    } catch (error) {
        console.error("[getProducts]", error);
        return res.status(500).json({ success: false, message: "Server error." });
    }
}

// GET /api/v1/products/:id
export async function getProductById(req, res) {
    try {
        const product = await prisma.product.findUnique({
            where: { id: req.params.id },
        });

        if (!product) {
            return res.status(404).json({ success: false, message: "Product not found." });
        }

        return res.status(200).json({ success: true, product });
    } catch (error) {
        console.error("[getProductById]", error);
        return res.status(500).json({ success: false, message: "Server error." });
    }
}

// POST /api/v1/products
// Admin only. Accepts multipart/form-data with optional image files.
// Fields: name, category, slug, price, originalPrice?, stock, active?
// Files:  images (up to 5)
export async function createProduct(req, res) {
    try {
        const { name, category, slug, price, originalPrice, stock, active } = req.body;

        if (!name || !category || !slug || !price || !stock) {
            return res.status(400).json({
                success: false,
                message: "name, category, slug, price and stock are required.",
            });
        }

        // Upload images to Cloudinary if provided
        const imageUrls = [];
        if (req.files && req.files.length > 0) {
            for (const file of req.files) {
                const result = await uploadToCloudinary(file.buffer, "castra/products");
                imageUrls.push(result.secure_url);
            }
        }

        const product = await prisma.product.create({
            data: {
                name,
                category,
                slug,
                price: parseInt(price),
                deliveryFee: 0,
                originalPrice: originalPrice ? parseInt(originalPrice) : null,
                stock: parseInt(stock),
                inStock: parseInt(stock) > 0,
                active: active === "false" ? false : true,
                images: imageUrls,
            },
        });

        // New product — invalidate the list cache so it appears immediately
        await invalidateProducts();

        return res.status(201).json({ success: true, product });
    } catch (error) {
        console.error("[createProduct]", error);
        return res.status(500).json({ success: false, message: "Server error." });
    }
}

// PATCH /api/v1/products/:id
// Admin only. Can update any field and optionally add new images.
// To replace all images, set replaceImages=true in the body.
export async function updateProduct(req, res) {
    try {
        const { id } = req.params;
        const {
            name, category, slug, price, originalPrice,
            stock, active, replaceImages,
        } = req.body;

        const existing = await prisma.product.findUnique({ where: { id } });
        if (!existing) {
            return res.status(404).json({ success: false, message: "Product not found." });
        }

        const data = {};
        if (name !== undefined) data.name = name;
        if (category !== undefined) data.category = category;
        if (slug !== undefined) data.slug = slug;
        if (price !== undefined) { data.price = parseInt(price); }
        if (originalPrice !== undefined) { data.originalPrice = originalPrice ? parseInt(originalPrice) : null; }
        if (stock !== undefined) {
            data.stock = parseInt(stock);
            data.inStock = parseInt(stock) > 0;
        }
        if (active !== undefined) data.active = active === "false" ? false : true;

        // Handle image updates
        if (req.files && req.files.length > 0) {
            const newUrls = [];
            for (const file of req.files) {
                const result = await uploadToCloudinary(file.buffer, "castra/products");
                newUrls.push(result.secure_url);
            }

            if (replaceImages === "true") {
                // Delete old images from Cloudinary
                for (const url of existing.images) {
                    const pid = publicIdFromUrl(url);
                    if (pid) await deleteFromCloudinary(pid);
                }
                data.images = newUrls;
            } else {
                // Append new images to existing ones
                data.images = [...existing.images, ...newUrls];
            }
        }

        const product = await prisma.product.update({ where: { id }, data });

        // Invalidate list cache + this product's single-entry cache
        await invalidateProducts(id);

        return res.status(200).json({ success: true, product });
    } catch (error) {
        console.error("[updateProduct]", error);
        return res.status(500).json({ success: false, message: "Server error." });
    }
}

// DELETE /api/v1/products/:id
// Admin only. Deletes product and all its images from Cloudinary.
export async function deleteProduct(req, res) {
    try {
        const { id } = req.params;

        const existing = await prisma.product.findUnique({ where: { id } });
        if (!existing) {
            return res.status(404).json({ success: false, message: "Product not found." });
        }

        // Remove images from Cloudinary
        for (const url of existing.images) {
            const pid = publicIdFromUrl(url);
            if (pid) await deleteFromCloudinary(pid);
        }

        await prisma.product.delete({ where: { id } });

        // Product gone — purge its cache entries
        await invalidateProducts(id);

        return res.status(200).json({ success: true, message: "Product deleted." });
    } catch (error) {
        console.error("[deleteProduct]", error);
        return res.status(500).json({ success: false, message: "Server error." });
    }
}

// PATCH /api/v1/products/:id/toggle
// Admin only. Toggles the active/inactive state without full update.
export async function toggleProductActive(req, res) {
    try {
        const { id } = req.params;

        const existing = await prisma.product.findUnique({ where: { id } });
        if (!existing) {
            return res.status(404).json({ success: false, message: "Product not found." });
        }

        const product = await prisma.product.update({
            where: { id },
            data: { active: !existing.active },
        });

        // Visibility changed — a toggled product appears/disappears in the list
        await invalidateProducts(id);

        return res.status(200).json({ success: true, product });
    } catch (error) {
        console.error("[toggleProductActive]", error);
        return res.status(500).json({ success: false, message: "Server error." });
    }
}
