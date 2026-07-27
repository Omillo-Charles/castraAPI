import prisma from "../database/neon.js";

// GET /api/v1/addresses
// Returns all saved addresses for the authenticated user.
export async function getAddresses(req, res) {
    try {
        const addresses = await prisma.address.findMany({
            where:   { userId: req.user.id },
            orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
        });

        return res.status(200).json({ success: true, addresses });
    } catch (error) {
        console.error("[getAddresses]", error);
        return res.status(500).json({ success: false, message: "Server error." });
    }
}

// POST /api/v1/addresses
// Creates a new address. If isDefault is true, clears the flag from all others first.
export async function createAddress(req, res) {
    try {
        const { label, street, city, county, isDefault = false } = req.body;

        if (!label || !street || !city || !county) {
            return res.status(400).json({
                success: false,
                message: "label, street, city and county are required.",
            });
        }

        // If this should be default, un-default the rest first
        if (isDefault) {
            await prisma.address.updateMany({
                where: { userId: req.user.id },
                data:  { isDefault: false },
            });
        }

        // If this is the user's first address, auto-set as default
        const count = await prisma.address.count({ where: { userId: req.user.id } });
        const shouldBeDefault = isDefault || count === 0;

        const address = await prisma.address.create({
            data: {
                userId:    req.user.id,
                label:     label.trim(),
                street:    street.trim(),
                city:      city.trim(),
                county:    county.trim(),
                isDefault: shouldBeDefault,
            },
        });

        return res.status(201).json({ success: true, address });
    } catch (error) {
        console.error("[createAddress]", error);
        return res.status(500).json({ success: false, message: "Server error." });
    }
}

// PATCH /api/v1/addresses/:id
// Updates an existing address. Ownership is verified.
export async function updateAddress(req, res) {
    try {
        const { id } = req.params;
        const { label, street, city, county, isDefault } = req.body;

        // Verify ownership
        const existing = await prisma.address.findFirst({
            where: { id, userId: req.user.id },
        });

        if (!existing) {
            return res.status(404).json({ success: false, message: "Address not found." });
        }

        // If promoting to default, un-default the others
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
        console.error("[updateAddress]", error);
        return res.status(500).json({ success: false, message: "Server error." });
    }
}

// PATCH /api/v1/addresses/:id/default
// Sets an address as the default, clearing the flag from all others.
export async function setDefaultAddress(req, res) {
    try {
        const { id } = req.params;

        const existing = await prisma.address.findFirst({
            where: { id, userId: req.user.id },
        });

        if (!existing) {
            return res.status(404).json({ success: false, message: "Address not found." });
        }

        // Clear all defaults for this user, then set this one
        await prisma.address.updateMany({
            where: { userId: req.user.id },
            data:  { isDefault: false },
        });

        const address = await prisma.address.update({
            where: { id },
            data:  { isDefault: true },
        });

        return res.status(200).json({ success: true, address });
    } catch (error) {
        console.error("[setDefaultAddress]", error);
        return res.status(500).json({ success: false, message: "Server error." });
    }
}

// DELETE /api/v1/addresses/:id
// Deletes an address. If it was the default, the most recent remaining address
// is promoted to default automatically.
export async function deleteAddress(req, res) {
    try {
        const { id } = req.params;

        const existing = await prisma.address.findFirst({
            where: { id, userId: req.user.id },
        });

        if (!existing) {
            return res.status(404).json({ success: false, message: "Address not found." });
        }

        await prisma.address.delete({ where: { id } });

        // If the deleted address was the default, promote the next most recent one
        if (existing.isDefault) {
            const next = await prisma.address.findFirst({
                where:   { userId: req.user.id },
                orderBy: { createdAt: "asc" },
            });
            if (next) {
                await prisma.address.update({
                    where: { id: next.id },
                    data:  { isDefault: true },
                });
            }
        }

        return res.status(200).json({ success: true, message: "Address deleted." });
    } catch (error) {
        console.error("[deleteAddress]", error);
        return res.status(500).json({ success: false, message: "Server error." });
    }
}
