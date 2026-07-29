import prisma from "../database/neon.js";
import { initiateSTKPush, normalisePhone } from "../config/mpesa.js";

// Helpers

/** Generate a human-readable order reference: CST-YYYYMMDD-XXXX */
function generateRef() {
    const now = new Date();
    const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
    const rand = String(Math.floor(1000 + Math.random() * 9000)); // 4-digit
    return `CST-${date}-${rand}`;
}

/** Safe order select — fields safe to return to the owning user */
const USER_ORDER_SELECT = {
    id: true,
    ref: true,
    firstName: true,
    lastName: true,
    email: true,
    phone: true,
    street: true,
    city: true,
    county: true,
    notes: true,
    subtotal: true,
    deliveryFee: true,
    discount: true,
    total: true,
    status: true,
    createdAt: true,
    updatedAt: true,
    items: {
        select: {
            id: true,
            name: true,
            price: true,
            qty: true,
            productId: true,
            product: {
                select: {
                    images: true,
                },
            },
        },
    },
    payment: {
        select: {
            id: true,
            method: true,
            status: true,
            amount: true,
            mpesaReceiptNumber: true,
            stkPhone: true,
            checkoutRequestId: true,
            createdAt: true,
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
// Places a new order from the user's active cart.
// Body: {
//   contact:  { firstName, lastName, email?, phone },
//   delivery: { street, city, county, notes? },
//   payment:  { method: "mpesa-stk", stkPhone? }
// }
// Flow:
//   1. Validate cart is not empty
//   2. Create Order + OrderItems in a transaction
//   3. Clear the cart
//   4. If STK push → initiate Daraja and create Payment record
//   5. If Paybill   → create Payment record with provided ref (PENDING)
//   6. Return order + payment details
export async function placeOrder(req, res) {
    try {
        const { contact, delivery, payment: paymentData } = req.body;

        // ── Validate input ──
        if (!contact?.firstName || !contact?.lastName || !contact?.phone) {
            return res.status(400).json({ success: false, message: "Contact details (firstName, lastName, phone) are required." });
        }
        if (!delivery?.street || !delivery?.city || !delivery?.county) {
            return res.status(400).json({ success: false, message: "Delivery address (street, city, county) is required." });
        }
        if (!paymentData?.method || !["mpesa-paybill", "mpesa-stk"].includes(paymentData.method)) {
            return res.status(400).json({ success: false, message: "payment.method must be 'mpesa-paybill' or 'mpesa-stk'." });
        }
        if (paymentData.method === "mpesa-stk" && !paymentData.stkPhone) {
            return res.status(400).json({ success: false, message: "payment.stkPhone is required for STK Push." });
        }

        // ── Get cart ──
        const cart = await prisma.cart.findUnique({
            where: { userId: req.user.id },
            include: { items: { include: { product: true } } },
        });

        if (!cart || cart.items.length === 0) {
            return res.status(400).json({ success: false, message: "Your cart is empty." });
        }

        // ── Check stock ──
        for (const item of cart.items) {
            if (!item.product.inStock || item.product.stock < item.qty) {
                return res.status(400).json({
                    success: false,
                    message: `"${item.product.name}" has insufficient stock. Please update your cart.`,
                });
            }
        }

        // ── Compute totals ──
        const subtotal = cart.items.reduce((s, i) => s + i.product.price * i.qty, 0);
        const deliveryFee = 350;
        const discount = cart.discount ?? 0;
        const total = subtotal - discount + deliveryFee;

        // ── Create order in a transaction ──
        const order = await prisma.$transaction(async (tx) => {
            // 1. Create the order
            const created = await tx.order.create({
                data: {
                    ref: generateRef(),
                    userId: req.user.id,
                    firstName: contact.firstName,
                    lastName: contact.lastName,
                    email: contact.email ?? null,
                    phone: contact.phone,
                    street: delivery.street,
                    city: delivery.city,
                    county: delivery.county,
                    notes: delivery.notes ?? null,
                    subtotal,
                    deliveryFee,
                    discount,
                    total,
                    status: "CONFIRMED",
                    items: {
                        create: cart.items.map((i) => ({
                            productId: i.productId,
                            name: i.product.name,
                            price: i.product.price,
                            qty: i.qty,
                        })),
                    },
                },
                include: { items: true },
            });

            // 2. Reduce stock — all in parallel to keep transaction fast
            await Promise.all(
                cart.items.map((item) => {
                    const newStock = item.product.stock - item.qty;
                    return tx.product.update({
                        where: { id: item.productId },
                        data: { stock: newStock, inStock: newStock > 0 },
                    });
                })
            );

            // 3. Clear the cart
            await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
            await tx.cart.update({
                where: { id: cart.id },
                data: { couponCode: null, discount: 0 },
            });

            return created;
        }, {
            timeout: 15000,       // 15s — enough for parallel product updates over Neon
            maxWait: 5000,
            isolationLevel: "ReadCommitted",
        });

        // ── Handle payment ──
        let paymentRecord = null;
        let stkDetails = null;

        // Create a default PENDING payment record first
        paymentRecord = await prisma.payment.create({
            data: {
                orderId: order.id,
                method: "MPESA_STK",
                amount: total,
                stkPhone: paymentData.stkPhone ?? null,
                status: "PENDING",
            },
        });

        let normalisedPhone;
        try {
            normalisedPhone = normalisePhone(paymentData.stkPhone);
        } catch {
            normalisedPhone = null;
        }

        if (normalisedPhone) {
            try {
                const stkRes = await initiateSTKPush({
                    amount: total,
                    phone: normalisedPhone,
                    orderId: order.id,
                    description: "CastraOrder",
                });

                paymentRecord = await prisma.payment.update({
                    where: { id: paymentRecord.id },
                    data: {
                        stkPhone: normalisedPhone,
                        checkoutRequestId: stkRes.CheckoutRequestID ?? null,
                    },
                });

                stkDetails = {
                    checkoutRequestId: stkRes.CheckoutRequestID,
                    customerMessage: stkRes.CustomerMessage,
                };
            } catch (stkError) {
                console.error("[placeOrder] STK push failed:", stkError.message);
                paymentRecord = await prisma.payment.update({
                    where: { id: paymentRecord.id },
                    data: { status: "FAILED" },
                });
                // Order still created — user can retry payment later
            }
        }

        return res.status(201).json({
            success: true,
            order: {
                id: order.id,
                ref: order.ref,
                total,
                status: order.status,
                items: order.items.map((i) => ({ name: i.name, qty: i.qty, price: i.price })),
            },
            payment: paymentRecord ? {
                id: paymentRecord.id,
                method: paymentRecord.method,
                status: paymentRecord.status,
            } : null,
            stk: stkDetails,
        });
    } catch (error) {
        console.error("[placeOrder]", error);
        return res.status(500).json({ success: false, message: "Server error. Please try again." });
    }
}

// GET /api/v1/orders
// User: their own orders (newest first)
// Admin: all orders with search + status filter
export async function getOrders(req, res) {
    try {
        const isAdmin = req.user.role === "ADMIN";
        const { status, search, page = "1", limit = "10" } = req.query;

        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.min(50, Math.max(1, parseInt(limit)));
        const skip = (pageNum - 1) * limitNum;

        const where = {};

        if (!isAdmin) {
            where.userId = req.user.id;
        }
        if (status) {
            where.status = status.toUpperCase();
        }
        if (isAdmin && search) {
            where.OR = [
                { ref: { contains: search, mode: "insensitive" } },
                { firstName: { contains: search, mode: "insensitive" } },
                { lastName: { contains: search, mode: "insensitive" } },
                { phone: { contains: search } },
            ];
        }

        const [orders, total] = await Promise.all([
            prisma.order.findMany({
                where,
                orderBy: { createdAt: "desc" },
                skip,
                take: limitNum,
                select: USER_ORDER_SELECT,
            }),
            prisma.order.count({ where }),
        ]);

        return res.status(200).json({
            success: true,
            orders: orders.map(withOrderItemImages),
            pagination: {
                total,
                page: pageNum,
                limit: limitNum,
                totalPages: Math.ceil(total / limitNum),
            },
        });
    } catch (error) {
        console.error("[getOrders]", error);
        return res.status(500).json({ success: false, message: "Server error." });
    }
}

// GET /api/v1/orders/customers
// Admin only — customers derived from placed orders, grouped by phone number.
export async function getOrderCustomers(req, res) {
    try {
        const { search = "", page = "1", limit = "8" } = req.query;
        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.min(50, Math.max(1, parseInt(limit)));
        const query = String(search).trim();

        const where = query
            ? {
                OR: [
                    { firstName: { contains: query, mode: "insensitive" } },
                    { lastName: { contains: query, mode: "insensitive" } },
                    { email: { contains: query, mode: "insensitive" } },
                    { phone: { contains: query } },
                ],
            }
            : {};

        const orders = await prisma.order.findMany({
            where,
            orderBy: { createdAt: "desc" },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                phone: true,
                total: true,
                createdAt: true,
            },
        });

        const customersByPhone = new Map();

        for (const order of orders) {
            const key = order.phone.replace(/\D/g, "") || order.phone;
            const existing = customersByPhone.get(key);

            if (existing) {
                existing.orders += 1;
                existing.total += order.total;
                if (order.createdAt > existing.lastOrderAt) {
                    existing.lastOrderAt = order.createdAt;
                    existing.name = `${order.firstName} ${order.lastName}`;
                    existing.email = order.email;
                    existing.phone = order.phone;
                }
            } else {
                customersByPhone.set(key, {
                    id: key,
                    name: `${order.firstName} ${order.lastName}`,
                    email: order.email,
                    phone: order.phone,
                    orders: 1,
                    total: order.total,
                    lastOrderAt: order.createdAt,
                });
            }
        }

        const customers = Array.from(customersByPhone.values())
            .sort((a, b) => b.lastOrderAt.getTime() - a.lastOrderAt.getTime());
        const total = customers.length;
        const pagedCustomers = customers.slice((pageNum - 1) * limitNum, pageNum * limitNum);

        return res.status(200).json({
            success: true,
            customers: pagedCustomers,
            pagination: {
                total,
                page: pageNum,
                limit: limitNum,
                totalPages: Math.ceil(total / limitNum),
            },
        });
    } catch (error) {
        console.error("[getOrderCustomers]", error);
        return res.status(500).json({ success: false, message: "Server error." });
    }
}

// GET /api/v1/orders/:idOrRef
// Get a single order by id or ref.
// Users can only access their own. Admins can access any.
export async function getOrder(req, res) {
    try {
        const { idOrRef } = req.params;
        const isAdmin = req.user.role === "ADMIN";

        const order = await prisma.order.findFirst({
            where: {
                OR: [{ id: idOrRef }, { ref: idOrRef }],
                ...(!isAdmin && { userId: req.user.id }),
            },
            select: USER_ORDER_SELECT,
        });

        if (!order) {
            return res.status(404).json({ success: false, message: "Order not found." });
        }

        return res.status(200).json({ success: true, order: withOrderItemImages(order) });
    } catch (error) {
        console.error("[getOrder]", error);
        return res.status(500).json({ success: false, message: "Server error." });
    }
}

// GET /api/v1/orders/track
// Public — search by order ref or phone number (used by /track-order page).
// Query: ?q=CST-xxx or ?q=0700000000
export async function trackOrder(req, res) {
    try {
        const { q } = req.query;

        if (!q || q.trim().length < 5) {
            return res.status(400).json({ success: false, message: "Provide an order reference or phone number." });
        }

        const query = q.trim();

        const order = await prisma.order.findFirst({
            where: {
                OR: [
                    { ref: { equals: query, mode: "insensitive" } },
                    { phone: { contains: query } },
                ],
            },
            select: {
                ...USER_ORDER_SELECT,
                // Mask phone for privacy on public endpoint
                phone: false,
            },
        });

        if (!order) {
            return res.status(404).json({ success: false, message: "No order found matching that reference." });
        }

        return res.status(200).json({ success: true, order: withOrderItemImages(order) });
    } catch (error) {
        console.error("[trackOrder]", error);
        return res.status(500).json({ success: false, message: "Server error." });
    }
}

// PATCH /api/v1/orders/:id/status
// Admin only — update order status.
// Body: { status: "PROCESSING"|"DISPATCHED"|"OUT_FOR_DELIVERY"|"DELIVERED" }
export async function updateOrderStatus(req, res) {
    try {
        const { id } = req.params;
        const { status } = req.body;

        const validStatuses = ["CONFIRMED", "PROCESSING", "DISPATCHED", "OUT_FOR_DELIVERY", "DELIVERED"];
        if (!status || !validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: `status must be one of: ${validStatuses.join(", ")}`,
            });
        }

        const existing = await prisma.order.findUnique({ where: { id } });
        if (!existing) {
            return res.status(404).json({ success: false, message: "Order not found." });
        }

        const order = await prisma.order.update({
            where: { id },
            data: { status },
            select: USER_ORDER_SELECT,
        });

        return res.status(200).json({ success: true, order });
    } catch (error) {
        console.error("[updateOrderStatus]", error);
        return res.status(500).json({ success: false, message: "Server error." });
    }
}
