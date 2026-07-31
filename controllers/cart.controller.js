import prisma from "../database/neon.js";
import { AppError } from "../middlewares/error.js";

// Cart lookup helpers

const CART_INCLUDE = {
    items: { include: { product: true }, orderBy: { createdAt: "asc" } },
};

// Find or create a cart for either an authenticated user or a guest session.
// cartOwner: { type: "user"|"guest", userId?: string, sessionId?: string }
async function getOrCreateCart(cartOwner) {
    const where = cartOwner.type === "user"
        ? { userId:    cartOwner.userId }
        : { sessionId: cartOwner.sessionId };

    let cart = await prisma.cart.findUnique({ where, include: CART_INCLUDE });

    if (!cart) {
        cart = await prisma.cart.create({
            data:    cartOwner.type === "user"
                ? { userId: cartOwner.userId }
                : { sessionId: cartOwner.sessionId },
            include: CART_INCLUDE,
        });
    }

    return cart;
}

function computeTotals(cart) {
    const subtotal    = cart.items.reduce((sum, item) => sum + item.product.price * item.qty, 0);
    const deliveryFee = 0;
    const discount    = cart.discount ?? 0;
    const total       = subtotal - discount;
    return { subtotal, discount, deliveryFee, total };
}

// GET /api/v1/cart 
export async function getCart(req, res, next) {
    try {
        const cart   = await getOrCreateCart(req.cartOwner);
        const totals = computeTotals(cart);
        return res.status(200).json({ success: true, cart: { ...cart, ...totals } });
    } catch (error) {
        next(error);
    }
}

// POST /api/v1/cart/items
export async function addItem(req, res, next) {
    try {
        const { productId, qty = 1 } = req.body;

        const product = await prisma.product.findUnique({ where: { id: productId } });
        if (!product || !product.active) throw new AppError("Product not found or unavailable.", 404);
        if (!product.inStock || product.stock < qty) throw new AppError("Insufficient stock.", 400);

        const cart     = await getOrCreateCart(req.cartOwner);
        const existing = cart.items.find(i => i.productId === productId);
        const newQty   = (existing?.qty ?? 0) + Number(qty);

        if (newQty > product.stock) throw new AppError("Requested quantity exceeds available stock.", 400);

        await prisma.cartItem.upsert({
            where:  { cartId_productId: { cartId: cart.id, productId } },
            update: { qty: newQty },
            create: { cartId: cart.id, productId, qty: Number(qty) },
        });

        const updated = await getOrCreateCart(req.cartOwner);
        return res.status(200).json({ success: true, cart: { ...updated, ...computeTotals(updated) } });
    } catch (error) {
        next(error);
    }
}

// PUT /api/v1/cart/items/:productId
export async function updateItem(req, res, next) {
    try {
        const { productId } = req.params;
        const qty           = Number(req.body.qty);

        const cart = await getOrCreateCart(req.cartOwner);
        const item = cart.items.find(i => i.productId === productId);
        if (!item) throw new AppError("Item not in cart.", 404);

        if (qty === 0) {
            await prisma.cartItem.delete({ where: { id: item.id } });
        } else {
            const product = await prisma.product.findUnique({ where: { id: productId } });
            if (product && qty > product.stock) throw new AppError("Requested quantity exceeds available stock.", 400);
            await prisma.cartItem.update({ where: { id: item.id }, data: { qty } });
        }

        const updated = await getOrCreateCart(req.cartOwner);
        return res.status(200).json({ success: true, cart: { ...updated, ...computeTotals(updated) } });
    } catch (error) {
        next(error);
    }
}

// DELETE /api/v1/cart/items/:productId
export async function removeItem(req, res, next) {
    try {
        const { productId } = req.params;
        const cart          = await getOrCreateCart(req.cartOwner);
        const item          = cart.items.find(i => i.productId === productId);
        if (!item) throw new AppError("Item not in cart.", 404);

        await prisma.cartItem.delete({ where: { id: item.id } });

        const updated = await getOrCreateCart(req.cartOwner);
        return res.status(200).json({ success: true, cart: { ...updated, ...computeTotals(updated) } });
    } catch (error) {
        next(error);
    }
}

// DELETE /api/v1/cart
export async function clearCart(req, res, next) {
    try {
        const cart = await getOrCreateCart(req.cartOwner);
        await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
        await prisma.cart.update({ where: { id: cart.id }, data: { couponCode: null, discount: 0 } });
        return res.status(200).json({ success: true, message: "Cart cleared." });
    } catch (error) {
        next(error);
    }
}

// POST /api/v1/cart/coupon
export async function applyCoupon(req, res, next) {
    try {
        // Placeholder — no coupon table yet
        throw new AppError("Invalid or expired coupon code.", 400);
    } catch (error) {
        next(error);
    }
}
