import prisma from "../database/neon.js";

// Helper: get or create a cart for the user
async function getOrCreateCart(userId) {
    let cart = await prisma.cart.findUnique({
        where:   { userId },
        include: {
            items: {
                include: { product: true },
                orderBy: { createdAt: "asc" },
            },
        },
    });

    if (!cart) {
        cart = await prisma.cart.create({
            data:    { userId },
            include: {
                items: {
                    include: { product: true },
                    orderBy: { createdAt: "asc" },
                },
            },
        });
    }

    return cart;
}

// Helper: compute cart totals
function computeTotals(cart) {
    const subtotal    = cart.items.reduce((sum, item) => sum + item.product.price * item.qty, 0);
    const discount    = cart.discount ?? 0;
    const deliveryFee = subtotal > 0 ? 350 : 0;
    const total       = subtotal - discount + deliveryFee;
    return { subtotal, discount, deliveryFee, total };
}

// GET /api/v1/cart
// Returns the user's cart with all items and totals.
export async function getCart(req, res) {
    try {
        const cart   = await getOrCreateCart(req.user.id);
        const totals = computeTotals(cart);

        return res.status(200).json({ success: true, cart: { ...cart, ...totals } });
    } catch (error) {
        console.error("[getCart]", error);
        return res.status(500).json({ success: false, message: "Server error." });
    }
}

// POST /api/v1/cart/items
// Add a product to the cart. If already present, increments qty.
// Body: { productId, qty? }
export async function addItem(req, res) {
    try {
        const { productId, qty = 1 } = req.body;

        if (!productId) {
            return res.status(400).json({ success: false, message: "productId is required." });
        }

        const product = await prisma.product.findUnique({ where: { id: productId } });
        if (!product || !product.active) {
            return res.status(404).json({ success: false, message: "Product not found or unavailable." });
        }
        if (!product.inStock || product.stock < qty) {
            return res.status(400).json({ success: false, message: "Insufficient stock." });
        }

        const cart = await getOrCreateCart(req.user.id);

        // Upsert: increment qty if item already in cart
        const existing = cart.items.find(i => i.productId === productId);
        const newQty   = (existing?.qty ?? 0) + Number(qty);

        if (newQty > product.stock) {
            return res.status(400).json({ success: false, message: "Requested quantity exceeds available stock." });
        }

        await prisma.cartItem.upsert({
            where:  { cartId_productId: { cartId: cart.id, productId } },
            update: { qty: newQty },
            create: { cartId: cart.id, productId, qty: Number(qty) },
        });

        const updated = await getOrCreateCart(req.user.id);
        const totals  = computeTotals(updated);

        return res.status(200).json({ success: true, cart: { ...updated, ...totals } });
    } catch (error) {
        console.error("[addItem]", error);
        return res.status(500).json({ success: false, message: "Server error." });
    }
}

// PUT /api/v1/cart/items/:productId
// Set exact qty for an item. qty=0 removes it.
// Body: { qty }
export async function updateItem(req, res) {
    try {
        const { productId } = req.params;
        const qty           = Number(req.body.qty);

        if (isNaN(qty) || qty < 0) {
            return res.status(400).json({ success: false, message: "qty must be a non-negative number." });
        }

        const cart = await getOrCreateCart(req.user.id);
        const item = cart.items.find(i => i.productId === productId);

        if (!item) {
            return res.status(404).json({ success: false, message: "Item not in cart." });
        }

        if (qty === 0) {
            await prisma.cartItem.delete({ where: { id: item.id } });
        } else {
            const product = await prisma.product.findUnique({ where: { id: productId } });
            if (product && qty > product.stock) {
                return res.status(400).json({ success: false, message: "Requested quantity exceeds available stock." });
            }
            await prisma.cartItem.update({ where: { id: item.id }, data: { qty } });
        }

        const updated = await getOrCreateCart(req.user.id);
        const totals  = computeTotals(updated);

        return res.status(200).json({ success: true, cart: { ...updated, ...totals } });
    } catch (error) {
        console.error("[updateItem]", error);
        return res.status(500).json({ success: false, message: "Server error." });
    }
}

// DELETE /api/v1/cart/items/:productId
// Remove a specific item from the cart.
export async function removeItem(req, res) {
    try {
        const { productId } = req.params;
        const cart          = await getOrCreateCart(req.user.id);
        const item          = cart.items.find(i => i.productId === productId);

        if (!item) {
            return res.status(404).json({ success: false, message: "Item not in cart." });
        }

        await prisma.cartItem.delete({ where: { id: item.id } });

        const updated = await getOrCreateCart(req.user.id);
        const totals  = computeTotals(updated);

        return res.status(200).json({ success: true, cart: { ...updated, ...totals } });
    } catch (error) {
        console.error("[removeItem]", error);
        return res.status(500).json({ success: false, message: "Server error." });
    }
}

// DELETE /api/v1/cart
// Clear all items and reset coupon.
export async function clearCart(req, res) {
    try {
        const cart = await getOrCreateCart(req.user.id);

        await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
        await prisma.cart.update({
            where: { id: cart.id },
            data:  { couponCode: null, discount: 0 },
        });

        return res.status(200).json({ success: true, message: "Cart cleared." });
    } catch (error) {
        console.error("[clearCart]", error);
        return res.status(500).json({ success: false, message: "Server error." });
    }
}

// POST /api/v1/cart/coupon
// Apply a coupon code. Placeholder — expand when coupons are set up.
// Body: { code }
export async function applyCoupon(req, res) {
    try {
        const { code } = req.body;

        if (!code) {
            return res.status(400).json({ success: false, message: "Coupon code is required." });
        }

        // Placeholder: no coupon table yet — reject all codes gracefully
        return res.status(400).json({
            success: false,
            message: "Invalid or expired coupon code.",
        });
    } catch (error) {
        console.error("[applyCoupon]", error);
        return res.status(500).json({ success: false, message: "Server error." });
    }
}
