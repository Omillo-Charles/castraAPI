import prisma from "../database/neon.js";
import { initiateSTKPush, normalisePhone } from "../config/mpesa.js";
import { sendMail } from "../config/resend.js";
import { buildUserOrderEmail, buildAdminOrderEmail, buildOrderStatusEmail } from "../utils/emailTemplates.js";
import { FRONTEND_URL, ADMIN_EMAIL } from "../config/env.js";
import { AppError } from "../middlewares/error.js";

// Helpers 

function generateRef() {
    const now  = new Date();
    const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
    const rand = String(Math.floor(1000 + Math.random() * 9000));
    return `CST-${date}-${rand}`;
}

const USER_ORDER_SELECT = {
    id: true, ref: true, firstName: true, lastName: true, email: true, phone: true,
    street: true, city: true, county: true, notes: true,
    subtotal: true, deliveryFee: true, discount: true, total: true,
    status: true, createdAt: true, updatedAt: true,
    items: {
        select: {
            id: true, name: true, price: true, qty: true, productId: true,
            product: { select: { images: true } },
        },
    },
    payment: {
        select: {
            id: true, method: true, status: true, amount: true,
            mpesaReceiptNumber: true, stkPhone: true, checkoutRequestId: true, createdAt: true,
        },
    },
};

function withOrderItemImages(order) {
    return {
        ...order,
        items: order.items.map(({ product, ...item }) => ({
            ...item,
            imageUrl: product?.images?.[0] ?? null,
        })),
    };
}

// POST /api/v1/orders
export async function placeOrder(req, res, next) {
    try {
        const { contact, delivery, payment: paymentData } = req.body;

        // ── Resolve cart owner (user or guest) ──
        const owner     = req.cartOwner;
        const cartWhere = owner.type === "user"
            ? { userId:    owner.userId }
            : { sessionId: owner.sessionId };

        // ── Fetch cart ──
        const cart = await prisma.cart.findUnique({
            where:   cartWhere,
            include: { items: { include: { product: true } } },
        });

        if (!cart || cart.items.length === 0) {
            throw new AppError("Your cart is empty.", 400);
        }

        // ── Stock check ──
        for (const item of cart.items) {
            if (!item.product.inStock || item.product.stock < item.qty) {
                throw new AppError(
                    `"${item.product.name}" has insufficient stock. Please update your cart.`,
                    400
                );
            }
        }

        // ── Totals ──
        const subtotal    = cart.items.reduce((s, i) => s + i.product.price * i.qty, 0);
        const deliveryFee = 0;
        const discount    = cart.discount ?? 0;
        const total       = subtotal - discount;

        // ── Transaction: create order + deduct stock + clear cart ──
        const order = await prisma.$transaction(async (tx) => {
            const created = await tx.order.create({
                data: {
                    ref:       generateRef(),
                    userId:    owner.type === "user" ? owner.userId : null,
                    sessionId: owner.type === "guest" ? owner.sessionId : null,
                    firstName:  contact.firstName,
                    lastName:   contact.lastName,
                    email:      contact.email ?? null,
                    phone:      contact.phone,
                    street:     delivery.street,
                    city:       delivery.city,
                    county:     delivery.county,
                    notes:      delivery.notes ?? null,
                    subtotal,
                    deliveryFee,
                    discount,
                    total,
                    status: "CONFIRMED",
                    items: {
                        create: cart.items.map((i) => ({
                            productId: i.productId,
                            name:      i.product.name,
                            price:     i.product.price,
                            qty:       i.qty,
                        })),
                    },
                },
                include: { items: true },
            });

            await Promise.all(
                cart.items.map((item) => {
                    const newStock = item.product.stock - item.qty;
                    return tx.product.update({
                        where: { id: item.productId },
                        data:  { stock: newStock, inStock: newStock > 0 },
                    });
                })
            );

            await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
            await tx.cart.update({ where: { id: cart.id }, data: { couponCode: null, discount: 0 } });

            return created;
        }, { timeout: 15000, maxWait: 5000, isolationLevel: "ReadCommitted" });

        // ── Payment ──
        let paymentRecord = await prisma.payment.create({
            data: {
                orderId:  order.id,
                method:   "MPESA_STK",
                amount:   total,
                stkPhone: paymentData.stkPhone ?? null,
                status:   "PENDING",
            },
        });

        let stkDetails = null;

        let normalisedPhone = null;
        try { normalisedPhone = normalisePhone(paymentData.stkPhone); } catch { /* invalid format */ }

        if (normalisedPhone) {
            try {
                const stkRes = await initiateSTKPush({
                    amount:      total,
                    phone:       normalisedPhone,
                    orderId:     order.id,
                    description: "CastraOrder",
                });

                paymentRecord = await prisma.payment.update({
                    where: { id: paymentRecord.id },
                    data:  { stkPhone: normalisedPhone, checkoutRequestId: stkRes.CheckoutRequestID ?? null },
                });

                stkDetails = { checkoutRequestId: stkRes.CheckoutRequestID, customerMessage: stkRes.CustomerMessage };
            } catch (stkError) {
                console.error("[placeOrder] STK push failed:", stkError.message);
                paymentRecord = await prisma.payment.update({
                    where: { id: paymentRecord.id },
                    data:  { status: "FAILED" },
                });
            }
        }

        // ── Emails ──
        const orderItems = cart.items.map((i) => ({
            name:     i.product.name,
            quantity: i.qty,
            price:    i.product.price,
            image:    i.product.images?.[0] ?? null,
            category: i.product.category ?? null,
        }));
        const orderUrl = `${FRONTEND_URL}/track-order?q=${order.ref}`;

        // Use the email saved on the order record — it was captured at checkout
        // and is the most reliable source. Falls back to the JWT user email for
        // authenticated users who left the email field blank at checkout.
        const recipientEmail = order.email
            || (owner.type === "user" ? req.user?.email : null)
            || null;

        if (recipientEmail) {
            sendMail({ to: recipientEmail, ...buildUserOrderEmail({ customerName: contact.firstName, orderId: order.ref, items: orderItems, total, orderUrl }) })
                .catch((e) => console.error("[placeOrder] user email failed:", e.message));
        } else {
            console.warn(`[placeOrder] No recipient email for order ${order.ref} — user email skipped.`);
        }

        if (ADMIN_EMAIL) {
            sendMail({
                to: ADMIN_EMAIL,
                ...buildAdminOrderEmail({
                    customerName:    `${contact.firstName} ${contact.lastName}`,
                    customerEmail:   order.email ?? (owner.type === "user" ? req.user?.email : null) ?? "",
                    customerPhone:   contact.phone,
                    orderId:         order.ref,
                    items:           orderItems,
                    subtotal,
                    total,
                    shippingAddress: `${delivery.street}, ${delivery.city}, ${delivery.county}`,
                    paymentMethod:   "MPESA_STK",
                    paymentStatus:   paymentRecord?.status ?? "PENDING",
                    stkPhone:        paymentData.stkPhone ?? "",
                    orderUrl,
                }),
            }).catch((e) => console.error("[placeOrder] admin email failed:", e.message));
        }

        return res.status(201).json({
            success: true,
            order: {
                id:     order.id,
                ref:    order.ref,
                total,
                status: order.status,
                items:  order.items.map((i) => ({ name: i.name, qty: i.qty, price: i.price })),
            },
            payment: paymentRecord
                ? { id: paymentRecord.id, method: paymentRecord.method, status: paymentRecord.status }
                : null,
            stk: stkDetails,
        });
    } catch (error) {
        next(error);
    }
}

// GET /api/v1/orders
export async function getOrders(req, res, next) {
    try {
        const isAdmin  = req.user.role === "ADMIN";
        const { status, search, page = "1", limit = "10" } = req.query;

        const pageNum  = Math.max(1, parseInt(page));
        const limitNum = Math.min(50, Math.max(1, parseInt(limit)));
        const skip     = (pageNum - 1) * limitNum;

        const where = {};
        if (!isAdmin) where.userId = req.user.id;
        if (status)   where.status = status.toUpperCase();
        if (isAdmin && search) {
            where.OR = [
                { ref:       { contains: search, mode: "insensitive" } },
                { firstName: { contains: search, mode: "insensitive" } },
                { lastName:  { contains: search, mode: "insensitive" } },
                { phone:     { contains: search } },
            ];
        }

        const [orders, total] = await Promise.all([
            prisma.order.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: limitNum, select: USER_ORDER_SELECT }),
            prisma.order.count({ where }),
        ]);

        return res.status(200).json({
            success: true,
            orders: orders.map(withOrderItemImages),
            pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) },
        });
    } catch (error) {
        next(error);
    }
}

// GET /api/v1/orders/customers
export async function getOrderCustomers(req, res, next) {
    try {
        const { search = "", page = "1", limit = "8" } = req.query;
        const pageNum  = Math.max(1, parseInt(page));
        const limitNum = Math.min(50, Math.max(1, parseInt(limit)));
        const query    = String(search).trim();

        const where = query ? {
            OR: [
                { firstName: { contains: query, mode: "insensitive" } },
                { lastName:  { contains: query, mode: "insensitive" } },
                { email:     { contains: query, mode: "insensitive" } },
                { phone:     { contains: query } },
            ],
        } : {};

        const orders = await prisma.order.findMany({
            where,
            orderBy: { createdAt: "desc" },
            select:  { id: true, firstName: true, lastName: true, email: true, phone: true, total: true, createdAt: true },
        });

        const byPhone = new Map();
        for (const o of orders) {
            const key = o.phone.replace(/\D/g, "") || o.phone;
            const ex  = byPhone.get(key);
            if (ex) {
                ex.orders += 1;
                ex.total  += o.total;
                if (o.createdAt > ex.lastOrderAt) {
                    ex.lastOrderAt = o.createdAt;
                    ex.name  = `${o.firstName} ${o.lastName}`;
                    ex.email = o.email;
                    ex.phone = o.phone;
                }
            } else {
                byPhone.set(key, { id: key, name: `${o.firstName} ${o.lastName}`, email: o.email, phone: o.phone, orders: 1, total: o.total, lastOrderAt: o.createdAt });
            }
        }

        const customers   = Array.from(byPhone.values()).sort((a, b) => b.lastOrderAt.getTime() - a.lastOrderAt.getTime());
        const total       = customers.length;
        const pagedCustomers = customers.slice((pageNum - 1) * limitNum, pageNum * limitNum);

        return res.status(200).json({
            success: true,
            customers: pagedCustomers,
            pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) },
        });
    } catch (error) {
        next(error);
    }
}

// GET /api/v1/orders/:idOrRef
export async function getOrder(req, res, next) {
    try {
        const { idOrRef } = req.params;
        const isAdmin     = req.user.role === "ADMIN";

        const order = await prisma.order.findFirst({
            where:  { OR: [{ id: idOrRef }, { ref: idOrRef }], ...(!isAdmin && { userId: req.user.id }) },
            select: USER_ORDER_SELECT,
        });

        if (!order) throw new AppError("Order not found.", 404);
        return res.status(200).json({ success: true, order: withOrderItemImages(order) });
    } catch (error) {
        next(error);
    }
}

// GET /api/v1/orders/track
export async function trackOrder(req, res, next) {
    try {
        const { q } = req.query;
        if (!q || q.trim().length < 5) throw new AppError("Provide an order reference or phone number.", 400);

        const order = await prisma.order.findFirst({
            where: {
                OR: [
                    { ref:   { equals: q.trim(), mode: "insensitive" } },
                    { phone: { contains: q.trim() } },
                ],
            },
            select: { ...USER_ORDER_SELECT, phone: false },
        });

        if (!order) throw new AppError("No order found matching that reference.", 404);
        return res.status(200).json({ success: true, order: withOrderItemImages(order) });
    } catch (error) {
        next(error);
    }
}

// PATCH /api/v1/orders/:id/status
export async function updateOrderStatus(req, res, next) {
    try {
        const { id }     = req.params;
        const { status } = req.body;

        const existing = await prisma.order.findUnique({ where: { id } });
        if (!existing) throw new AppError("Order not found.", 404);

        const order = await prisma.order.update({ where: { id }, data: { status }, select: USER_ORDER_SELECT });

        if (order.email) {
            sendMail({
                to: order.email,
                ...buildOrderStatusEmail({
                    customerName: order.firstName,
                    orderId:      order.ref,
                    orderStatus:  status,
                    items:        order.items.map((i) => ({
                        name:     i.name,
                        quantity: i.qty,
                        price:    i.price,
                        image:    i.product?.images?.[0] ?? null,
                    })),
                    total:    order.total,
                    orderUrl: `${FRONTEND_URL}/track-order?q=${order.ref}`,
                }),
            }).catch((e) => console.error("[updateOrderStatus] email failed:", e.message));
        }

        return res.status(200).json({ success: true, order });
    } catch (error) {
        next(error);
    }
}
