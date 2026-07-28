import prisma from "../database/neon.js";

// Helper: get or create wishlist
async function getOrCreateWishlist(userId) {
    let wishlist = await prisma.wishlist.findUnique({
        where:   { userId },
        include: {
            items: {
                include: { product: true },
                orderBy: { createdAt: "desc" },
            },
        },
    });

    if (!wishlist) {
        wishlist = await prisma.wishlist.create({
            data:    { userId },
            include: {
                items: {
                    include: { product: true },
                    orderBy: { createdAt: "desc" },
                },
            },
        });
    }

    return wishlist;
}

// GET /api/v1/wishlist
export async function getWishlist(req, res) {
    try {
        const wishlist = await getOrCreateWishlist(req.user.id);
        return res.status(200).json({ success: true, wishlist });
    } catch (error) {
        console.error("[getWishlist]", error);
        return res.status(500).json({ success: false, message: "Server error." });
    }
}

// POST /api/v1/wishlist
// Add a product. Idempotent — silently succeeds if already present.
// Body: { productId }
export async function addToWishlist(req, res) {
    try {
        const { productId } = req.body;

        if (!productId) {
            return res.status(400).json({ success: false, message: "productId is required." });
        }

        const product = await prisma.product.findUnique({ where: { id: productId } });
        if (!product || !product.active) {
            return res.status(404).json({ success: false, message: "Product not found or unavailable." });
        }

        const wishlist = await getOrCreateWishlist(req.user.id);

        // Upsert — no error if already wishlisted
        await prisma.wishlistItem.upsert({
            where:  { wishlistId_productId: { wishlistId: wishlist.id, productId } },
            update: {},   // nothing to update, just ensure it exists
            create: { wishlistId: wishlist.id, productId },
        });

        const updated = await getOrCreateWishlist(req.user.id);
        return res.status(200).json({ success: true, wishlist: updated });
    } catch (error) {
        console.error("[addToWishlist]", error);
        return res.status(500).json({ success: false, message: "Server error." });
    }
}

// DELETE /api/v1/wishlist/:productId
// Remove a product from the wishlist.
export async function removeFromWishlist(req, res) {
    try {
        const { productId } = req.params;
        const wishlist      = await getOrCreateWishlist(req.user.id);
        const item          = wishlist.items.find(i => i.productId === productId);

        if (!item) {
            return res.status(404).json({ success: false, message: "Product not in wishlist." });
        }

        await prisma.wishlistItem.delete({ where: { id: item.id } });

        const updated = await getOrCreateWishlist(req.user.id);
        return res.status(200).json({ success: true, wishlist: updated });
    } catch (error) {
        console.error("[removeFromWishlist]", error);
        return res.status(500).json({ success: false, message: "Server error." });
    }
}

// GET /api/v1/wishlist/check/:productId 
// Quick check — is this product in the user's wishlist?
export async function checkWishlisted(req, res) {
    try {
        const { productId } = req.params;
        const wishlist      = await getOrCreateWishlist(req.user.id);
        const wishlisted    = wishlist.items.some(i => i.productId === productId);
        return res.status(200).json({ success: true, wishlisted });
    } catch (error) {
        console.error("[checkWishlisted]", error);
        return res.status(500).json({ success: false, message: "Server error." });
    }
}
