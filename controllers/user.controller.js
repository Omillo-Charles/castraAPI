import bcrypt from "bcryptjs";
import prisma from "../database/neon.js";
import { AppError } from "../middlewares/error.js";

// GET /api/v1/users/me
export async function getProfile(req, res, next) {
    try {
        const user = await prisma.user.findUnique({
            where:  { id: req.user.id },
            select: { id: true, firstName: true, lastName: true, email: true, phone: true, role: true, emailVerified: true, createdAt: true },
        });

        if (!user) throw new AppError("User not found.", 404);
        return res.status(200).json({ success: true, user });
    } catch (error) {
        next(error);
    }
}

// PATCH /api/v1/users/me
export async function updateProfile(req, res, next) {
    try {
        const { firstName, lastName, phone } = req.body;

        const data = {};
        if (firstName) data.firstName = firstName.trim();
        if (lastName)  data.lastName  = lastName.trim();
        if (phone !== undefined) data.phone = phone?.trim() || null;

        const user = await prisma.user.update({
            where:  { id: req.user.id },
            data,
            select: { id: true, firstName: true, lastName: true, email: true, phone: true, role: true },
        });

        return res.status(200).json({ success: true, user });
    } catch (error) {
        next(error);
    }
}

// PATCH /api/v1/users/me/password
export async function changePassword(req, res, next) {
    try {
        const { currentPassword, newPassword } = req.body;

        const user = await prisma.user.findUnique({ where: { id: req.user.id } });

        if (!user.password) {
            throw new AppError("This account uses Google sign-in and does not have a password.", 400);
        }

        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) throw new AppError("Current password is incorrect.", 401);

        const hashed = await bcrypt.hash(newPassword, 12);
        await prisma.user.update({ where: { id: req.user.id }, data: { password: hashed } });

        return res.status(200).json({ success: true, message: "Password updated successfully." });
    } catch (error) {
        next(error);
    }
}

// DELETE /api/v1/users/me
export async function deleteAccount(req, res, next) {
    try {
        await prisma.user.delete({ where: { id: req.user.id } });

        res.clearCookie("token", {
            httpOnly: true,
            secure:   process.env.NODE_ENV === "production",
            sameSite: "lax",
        });

        return res.status(200).json({ success: true, message: "Account deleted successfully." });
    } catch (error) {
        next(error);
    }
}
