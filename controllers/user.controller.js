import bcrypt from "bcryptjs";
import prisma from "../database/neon.js";

// GET /api/v1/users/me
// Returns the full profile of the currently authenticated user.
export async function getProfile(req, res) {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.user.id },
            select: {
                id:            true,
                firstName:     true,
                lastName:      true,
                email:         true,
                phone:         true,
                role:          true,
                emailVerified: true,
                createdAt:     true,
            },
        });

        if (!user) {
            return res.status(404).json({ success: false, message: "User not found." });
        }

        return res.status(200).json({ success: true, user });
    } catch (error) {
        console.error("[getProfile]", error);
        return res.status(500).json({ success: false, message: "Server error." });
    }
}

// PATCH /api/v1/users/me
// Updates firstName, lastName, phone. Email changes are not allowed here
// (would require re-verification). Password has its own endpoint.
export async function updateProfile(req, res) {
    try {
        const { firstName, lastName, phone } = req.body;

        // At least one field must be provided
        if (!firstName && !lastName && phone === undefined) {
            return res.status(400).json({
                success: false,
                message: "Provide at least one field to update.",
            });
        }

        const data = {};
        if (firstName) data.firstName = firstName.trim();
        if (lastName)  data.lastName  = lastName.trim();
        if (phone !== undefined) data.phone = phone?.trim() || null;

        const user = await prisma.user.update({
            where: { id: req.user.id },
            data,
            select: {
                id:        true,
                firstName: true,
                lastName:  true,
                email:     true,
                phone:     true,
                role:      true,
            },
        });

        return res.status(200).json({ success: true, user });
    } catch (error) {
        console.error("[updateProfile]", error);
        return res.status(500).json({ success: false, message: "Server error." });
    }
}

// PATCH /api/v1/users/me/password
// Changes the user's password. Requires the current password for verification.
// Google-only users (no password) cannot use this endpoint.
export async function changePassword(req, res) {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({
                success: false,
                message: "Current password and new password are required.",
            });
        }

        if (newPassword.length < 8) {
            return res.status(400).json({
                success: false,
                message: "New password must be at least 8 characters.",
            });
        }

        // Fetch with password field (excluded by default in selects)
        const user = await prisma.user.findUnique({ where: { id: req.user.id } });

        if (!user.password) {
            return res.status(400).json({
                success: false,
                message: "This account uses Google sign-in and does not have a password.",
            });
        }

        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            return res.status(401).json({
                success: false,
                message: "Current password is incorrect.",
            });
        }

        if (currentPassword === newPassword) {
            return res.status(400).json({
                success: false,
                message: "New password must be different from the current password.",
            });
        }

        const hashed = await bcrypt.hash(newPassword, 12);
        await prisma.user.update({
            where: { id: req.user.id },
            data:  { password: hashed },
        });

        return res.status(200).json({ success: true, message: "Password updated successfully." });
    } catch (error) {
        console.error("[changePassword]", error);
        return res.status(500).json({ success: false, message: "Server error." });
    }
}

// DELETE /api/v1/users/me
// Permanently deletes the authenticated user's account and all related data.
// Cascade deletes handle cart, wishlist, addresses via Prisma relations.
export async function deleteAccount(req, res) {
    try {
        await prisma.user.delete({ where: { id: req.user.id } });

        // Clear auth cookie
        res.clearCookie("token", {
            httpOnly: true,
            secure:   process.env.NODE_ENV === "production",
            sameSite: "lax",
        });

        return res.status(200).json({
            success: true,
            message: "Account deleted successfully.",
        });
    } catch (error) {
        console.error("[deleteAccount]", error);
        return res.status(500).json({ success: false, message: "Server error." });
    }
}
