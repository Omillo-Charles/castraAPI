import prisma from "../database/neon.js";
import { AppError } from "../middlewares/error.js";

function isCouponCurrentlyValid(coupon, now = new Date()) {
  if (!coupon.active) return false;
  if (coupon.validFrom && coupon.validFrom > now) return false;
  if (coupon.validUntil && coupon.validUntil < now) return false;
  return true;
}

function getCartSubtotal(cart) {
  return cart.items.reduce((sum, item) => sum + item.product.price * item.qty, 0);
}

async function getCartForCoupon(cartOwner) {
  const where = cartOwner.type === "user"
    ? { userId: cartOwner.userId }
    : { sessionId: cartOwner.sessionId };

  return prisma.cart.findUnique({
    where,
    include: {
      items: {
        include: { product: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });
}

export async function listCoupons(req, res, next) {
  try {
    const coupons = await prisma.coupon.findMany({
      orderBy: { createdAt: "desc" },
    });

    return res.status(200).json({
      success: true,
      coupons: coupons.map((coupon) => ({
        ...coupon,
        remainingUses: coupon.usageLimit ? Math.max(coupon.usageLimit - coupon.usedCount, 0) : null,
      })),
    });
  } catch (error) {
    next(error);
  }
}

export async function getCoupon(req, res, next) {
  try {
    const { id } = req.params;

    const coupon = await prisma.coupon.findUnique({ where: { id } });
    if (!coupon) throw new AppError("Coupon not found.", 404);

    return res.status(200).json({
      success: true,
      coupon: {
        ...coupon,
        remainingUses: coupon.usageLimit ? Math.max(coupon.usageLimit - coupon.usedCount, 0) : null,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function createCoupon(req, res, next) {
  try {
    const { code, description, amount, active, minOrderTotal, usageLimit, validFrom, validUntil } = req.body;

    const normalizedCode = String(code).trim().toUpperCase();
    const existing = await prisma.coupon.findUnique({ where: { code: normalizedCode } });
    if (existing) throw new AppError("A coupon with this code already exists.", 409);

    const coupon = await prisma.coupon.create({
      data: {
        code: normalizedCode,
        description: description || null,
        amount: Number(amount),
        active: active !== false,
        minOrderTotal: Number(minOrderTotal ?? 0),
        usageLimit: usageLimit === null || usageLimit === undefined ? null : Number(usageLimit),
        validFrom: validFrom ? new Date(validFrom) : null,
        validUntil: validUntil ? new Date(validUntil) : null,
        createdBy: req.user?.id || null,
      },
    });

    return res.status(201).json({ success: true, coupon });
  } catch (error) {
    next(error);
  }
}

export async function updateCoupon(req, res, next) {
  try {
    const { id } = req.params;
    const payload = { ...req.body };

    if (payload.code) payload.code = String(payload.code).trim().toUpperCase();
    if (payload.amount !== undefined) payload.amount = Number(payload.amount);
    if (payload.minOrderTotal !== undefined) payload.minOrderTotal = Number(payload.minOrderTotal);
    if (payload.usageLimit !== undefined) payload.usageLimit = payload.usageLimit === null ? null : Number(payload.usageLimit);
    if (payload.validFrom !== undefined && payload.validFrom !== null && payload.validFrom !== "") payload.validFrom = new Date(payload.validFrom);
    if (payload.validUntil !== undefined && payload.validUntil !== null && payload.validUntil !== "") payload.validUntil = new Date(payload.validUntil);
    if (payload.validFrom === "") payload.validFrom = null;
    if (payload.validUntil === "") payload.validUntil = null;

    const existing = await prisma.coupon.findUnique({ where: { id } });
    if (!existing) throw new AppError("Coupon not found.", 404);

    if (payload.code && payload.code !== existing.code) {
      const codeTaken = await prisma.coupon.findUnique({ where: { code: payload.code } });
      if (codeTaken) throw new AppError("A coupon with this code already exists.", 409);
    }

    const coupon = await prisma.coupon.update({
      where: { id },
      data: payload,
    });

    return res.status(200).json({ success: true, coupon });
  } catch (error) {
    next(error);
  }
}

export async function deleteCoupon(req, res, next) {
  try {
    const { id } = req.params;
    const existing = await prisma.coupon.findUnique({ where: { id } });
    if (!existing) throw new AppError("Coupon not found.", 404);

    await prisma.coupon.delete({ where: { id } });

    return res.status(200).json({ success: true, message: "Coupon deleted successfully." });
  } catch (error) {
    next(error);
  }
}

export async function applyCoupon(req, res, next) {
  try {
    const { code } = req.body;
    const cart = await getCartForCoupon(req.cartOwner);

    if (!cart || cart.items.length === 0) {
      throw new AppError("Your cart is empty.", 400);
    }

    const coupon = await prisma.coupon.findUnique({
      where: { code: String(code).trim().toUpperCase() },
    });

    if (!coupon) {
      throw new AppError("Invalid coupon code.", 400);
    }

    const now = new Date();
    if (!isCouponCurrentlyValid(coupon, now)) {
      throw new AppError("This coupon is not active or has expired.", 400);
    }

    const subtotal = getCartSubtotal(cart);
    if (subtotal < coupon.minOrderTotal) {
      throw new AppError(`This coupon requires a minimum order of KSh ${coupon.minOrderTotal.toLocaleString("en-KE")}.`, 400);
    }

    if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) {
      throw new AppError("This coupon has reached its usage limit.", 400);
    }

    const cartDiscount = Math.min(coupon.amount, subtotal);

    const updatedCart = await prisma.cart.update({
      where: { id: cart.id },
      data: {
        couponCode: coupon.code,
        discount: cartDiscount,
      },
      include: {
        items: { include: { product: true }, orderBy: { createdAt: "asc" } },
      },
    });

    const totals = {
      subtotal,
      discount: cartDiscount,
      deliveryFee: 0,
      total: subtotal - cartDiscount,
    };

    return res.status(200).json({
      success: true,
      message: "Coupon applied successfully.",
      cart: { ...updatedCart, ...totals },
    });
  } catch (error) {
    next(error);
  }
}
