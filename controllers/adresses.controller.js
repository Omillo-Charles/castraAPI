import prisma from "../database/neon.js";
import { AppError } from "../middlewares/error.js";

// GET /api/v1/addresses
export async function getAddresses(req, res, next) {
    try {
        const addresses = await prisma.address.findMany({
            where:   { userId: req.user.id },
            orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
        });
        return res.status(200).json({ success: true, addresses });
    } catch (error) {
        next(error);
    }
}

// POST /api/v1/addresses
export async function createAddress(req, res, next) {
    try {
        const { label, street, city, county, isDefault = false } = req.body;

        if (isDefault) {
            await prisma.address.updateMany({ where: { userId: req.user.id }, data: { isDefault: false } });
        }

        const count = await prisma.address.count({ where: { userId: req.user.id } });

        const address = await prisma.address.create({
            data: {
                userId:    req.user.id,
                label:     label.trim(),
                street:    street.trim(),
                city:      city.trim(),
                county:    county.trim(),
                isDefault: isDefault || count === 0,
            },
        });

        return res.status(201).json({ success: true, address });
    } catch (error) {
        next(error);
    }
}

// PATCH /api/v1/addresses/:id
export async function updateAddress(req, res, next) {
    try {
        const { id } = req.params;
        const { label, street, city, county, isDefault } = req.body;

        const existing = await prisma.address.findFirst({ where: { id, userId: req.user.id } });
        if (!existing) throw new AppError("Address not found.", 404);

        if (isDefault) {
            await prisma.address.updateMany({
                where: { userId: req.user.id, NOT: { id } },
                data:  { isDefault: false },
            });
        }

        const data = {};
        if (label     !== undefined) data.label     = label.trim();
        if (street    !== undefined) data.street    = street.trim();
        if (city      !== undefined) data.city      = city.trim();
        if (county    !== undefined) data.county    = county.trim();
        if (isDefault !== undefined) data.isDefault = isDefault;

        const address = await prisma.address.update({ where: { id }, data });
        return res.status(200).json({ success: true, address });
    } catch (error) {
        next(error);
    }
}

// PATCH /api/v1/addresses/:id/default
export async function setDefaultAddress(req, res, next) {
    try {
        const { id } = req.params;

        const existing = await prisma.address.findFirst({ where: { id, userId: req.user.id } });
        if (!existing) throw new AppError("Address not found.", 404);

        await prisma.address.updateMany({ where: { userId: req.user.id }, data: { isDefault: false } });
        const address = await prisma.address.update({ where: { id }, data: { isDefault: true } });

        return res.status(200).json({ success: true, address });
    } catch (error) {
        next(error);
    }
}

// DELETE /api/v1/addresses/:id
export async function deleteAddress(req, res, next) {
    try {
        const { id } = req.params;

        const existing = await prisma.address.findFirst({ where: { id, userId: req.user.id } });
        if (!existing) throw new AppError("Address not found.", 404);

        await prisma.address.delete({ where: { id } });

        if (existing.isDefault) {
            const next_ = await prisma.address.findFirst({ where: { userId: req.user.id }, orderBy: { createdAt: "asc" } });
            if (next_) await prisma.address.update({ where: { id: next_.id }, data: { isDefault: true } });
        }

        return res.status(200).json({ success: true, message: "Address deleted." });
    } catch (error) {
        next(error);
    }
}
