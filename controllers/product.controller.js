import prisma from "../database/neon.js";
import { uploadToCloudinary, deleteFromCloudinary } from "../config/cloudinary.js";
import { invalidateProducts } from "../middlewares/cacher.js";
import { AppError } from "../middlewares/error.js";

function publicIdFromUrl(url) {
    try {
        const parts = url.split("/upload/");
        if (parts.length < 2) return null;
        const withoutVersion = parts[1].replace(/^v\d+\//, "");
        return withoutVersion.replace(/\.[^.]+$/, "");
    } catch {
        return null;
    }
}

// GET /api/v1/products
export async function getProducts(req, res, next) {
    try {
        const { category, page = "1", limit = "8", sort, search } = req.query;

        const pageNum  = Math.max(1, parseInt(page));
        const limitNum = Math.min(50, Math.max(1, parseInt(limit)));
        const skip     = (pageNum - 1) * limitNum;

        const where = { active: true };
        if (category) {
            const slugified = category.toLowerCase().replace(/\s+/g, "-");
            where.OR = [
                { category: { equals: category, mode: "insensitive" } },
                { slug:     { equals: category, mode: "insensitive" } },
                { slug:     { equals: slugified, mode: "insensitive" } },
            ];
        }
        if (search) where.name = { contains: search, mode: "insensitive" };

        const orderBy = sort === "price-asc"  ? { price: "asc" }
                      : sort === "price-desc" ? { price: "desc" }
                      :                         { createdAt: "desc" };

        const [products, total] = await Promise.all([
            prisma.product.findMany({ where, orderBy, skip, take: limitNum }),
            prisma.product.count({ where }),
        ]);

        return res.status(200).json({
            success: true,
            products,
            pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) },
        });
    } catch (error) {
        next(error);
    }
}

// GET /api/v1/products/:id
export async function getProductById(req, res, next) {
    try {
        const product = await prisma.product.findUnique({ where: { id: req.params.id } });
        if (!product) throw new AppError("Product not found.", 404);
        return res.status(200).json({ success: true, product });
    } catch (error) {
        next(error);
    }
}

// POST /api/v1/products
export async function createProduct(req, res, next) {
    try {
        const { name, category, slug, price, originalPrice, stock, active, deliveryFee } = req.body;

        const imageUrls = [];
        if (req.files?.length > 0) {
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
                price:         Number(price),
                deliveryFee:   Number(deliveryFee ?? 0),
                originalPrice: originalPrice ? Number(originalPrice) : null,
                stock:         Number(stock),
                inStock:       Number(stock) > 0,
                active:        active === "false" ? false : true,
                images:        imageUrls,
            },
        });

        await invalidateProducts();
        return res.status(201).json({ success: true, product });
    } catch (error) {
        next(error);
    }
}

// PATCH /api/v1/products/:id
export async function updateProduct(req, res, next) {
    try {
        const { id } = req.params;
        const { name, category, slug, price, originalPrice, stock, active, replaceImages, deliveryFee } = req.body;

        const existing = await prisma.product.findUnique({ where: { id } });
        if (!existing) throw new AppError("Product not found.", 404);

        const data = {};
        if (name          !== undefined) data.name          = name;
        if (category      !== undefined) data.category      = category;
        if (slug          !== undefined) data.slug          = slug;
        if (price         !== undefined) data.price         = Number(price);
        if (deliveryFee   !== undefined) data.deliveryFee   = Number(deliveryFee);
        if (originalPrice !== undefined) data.originalPrice = originalPrice ? Number(originalPrice) : null;
        if (stock         !== undefined) { data.stock = Number(stock); data.inStock = Number(stock) > 0; }
        if (active        !== undefined) data.active        = active === "false" ? false : true;

        if (req.files?.length > 0) {
            const newUrls = [];
            for (const file of req.files) {
                const result = await uploadToCloudinary(file.buffer, "castra/products");
                newUrls.push(result.secure_url);
            }
            if (replaceImages === "true") {
                for (const url of existing.images) {
                    const pid = publicIdFromUrl(url);
                    if (pid) await deleteFromCloudinary(pid);
                }
                data.images = newUrls;
            } else {
                data.images = [...existing.images, ...newUrls];
            }
        }

        const product = await prisma.product.update({ where: { id }, data });
        await invalidateProducts(id);
        return res.status(200).json({ success: true, product });
    } catch (error) {
        next(error);
    }
}

// DELETE /api/v1/products/:id
export async function deleteProduct(req, res, next) {
    try {
        const { id } = req.params;

        const existing = await prisma.product.findUnique({ where: { id } });
        if (!existing) throw new AppError("Product not found.", 404);

        for (const url of existing.images) {
            const pid = publicIdFromUrl(url);
            if (pid) await deleteFromCloudinary(pid);
        }

        await prisma.product.delete({ where: { id } });
        await invalidateProducts(id);
        return res.status(200).json({ success: true, message: "Product deleted." });
    } catch (error) {
        next(error);
    }
}

// PATCH /api/v1/products/:id/toggle
export async function toggleProductActive(req, res, next) {
    try {
        const { id } = req.params;

        const existing = await prisma.product.findUnique({ where: { id } });
        if (!existing) throw new AppError("Product not found.", 404);

        const product = await prisma.product.update({ where: { id }, data: { active: !existing.active } });
        await invalidateProducts(id);
        return res.status(200).json({ success: true, product });
    } catch (error) {
        next(error);
    }
}
