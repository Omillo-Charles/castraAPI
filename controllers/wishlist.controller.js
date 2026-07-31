import prisma from "../database/neon.js";
import { AppError } from "../middlewares/error.js";

async function getOrCreateWishlist(userId) {
    let wishlist = await prisma.wishlist.findUnique({
        where:   { userId },
        include: { items: { include: { product: true }, orderBy: { createdAt: "desc" } } },
    });

    if (!wishlist) {
        wishlist = await prisma.wishlist.create({
            data:    { userId },
            include: { items: { include: { product: true }, orderBy: { createdAt: "desc" } } },
        });
    }

    return wishlist;
}

// GET /api/v1/wishlist
export async function getWishlist(req, res, next) {
    try {
        const wishlist = await getOrCreateWishlist(req.user.id);
        return res.status(200).json({ success: true, wishlist });
    } catch (error) {
        next(error);
    }
}

// POST /api/v1/wishlist
export async function addToWishlist(req, res, next) {
    try {
        const { productId } = req.body;

        const product = await prisma.product.findUnique({ where: { id: productId } });
        if (!product || !product.active) throw new AppError("Product not found or unavailable.", 404);

        const wishlist = await getOrCreateWishlist(req.user.id);

        await prisma.wishlistItem.upsert({
            where:  { wishlistId_productId: { wishlistId: wishlist.id, productId } },
            update: {},
            create: { wishlistId: wishlist.id, productId },
        });

        const updated = await getOrCreateWishlist(req.user.id);
        return res.status(200).json({ success: true, wishlist: updated });
    } catch (error) {
        next(error);
    }
}

// DELETE /api/v1/wishlist/:productId
export async function removeFromWishlist(req, res, next) {
    try {
        const { productId } = req.params;
        const wishlist      = await getOrCreateWishlist(req.user.id);
        const item          = wishlist.items.find(i => i.productId === productId);
        if (!item) throw new AppError("Product not in wishlist.", 404);

        await prisma.wishlistItem.delete({ where: { id: item.id } });

        const updated = await getOrCreateWishlist(req.user.id);
        return res.status(200).json({ success: true, wishlist: updated });
    } catch (error) {
        next(error);
    }
}

// GET /api/v1/wishlist/check/:productId
export async function checkWishlisted(req, res, next) {
    try {
        const { productId } = req.params;
        const wishlist      = await getOrCreateWishlist(req.user.id);
        const wishlisted    = wishlist.items.some(i => i.productId === productId);
        return res.status(200).json({ success: true, wishlisted });
    } catch (error) {
        next(error);
    }
}
