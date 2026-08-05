import { z } from "zod";

// Middleware factory
// Takes a Zod schema and returns an Express middleware.
// Validates req.body and replaces it with the parsed (coerced + stripped) value.
// On failure returns 400 with a clean array of field-level errors.

export function validate(schema) {
    return (req, res, next) => {
        const result = schema.safeParse(req.body);

        if (!result.success) {
            const errors = result.error.errors.map((e) => ({
                field:   e.path.join(".") || "body",
                message: e.message,
            }));

            return res.status(400).json({
                success: false,
                message: errors[0].message,   // top-level human message = first error
                errors,                        // full list for client-side field highlighting
            });
        }

        // Replace req.body with the clean, parsed value so controllers
        // never touch raw untrusted input again
        req.body = result.data;
        next();
    };
}

// Reusable primitives

const name = z
    .string({ required_error: "This field is required." })
    .min(1, "Cannot be empty.")
    .max(64, "Too long — max 64 characters.")
    .trim();

const email = z
    .string({ required_error: "Email is required." })
    .email("Please enter a valid email address.")
    .toLowerCase()
    .trim();

const password = z
    .string({ required_error: "Password is required." })
    .min(8, "Password must be at least 8 characters.")
    .max(128, "Password is too long.");

// Kenyan phone — accepts 07xx, 01xx, +2547xx, 2547xx
const phone = z
    .string()
    .regex(
        /^(?:\+?254|0)[17]\d{8}$/,
        "Enter a valid Kenyan phone number (e.g. 0712345678 or +254712345678)."
    )
    .trim();

const productId = z
    .string({ required_error: "productId is required." })
    .cuid("Invalid product ID.");

const positiveInt = (field) =>
    z.coerce
        .number({ required_error: `${field} is required.` })
        .int(`${field} must be a whole number.`)
        .positive(`${field} must be greater than zero.`);

// Auth schemas

export const registerSchema = z.object({
    firstName: name.describe("First name"),
    lastName:  name.describe("Last name"),
    email,
    password,
    phone:     phone.optional(),
});

export const loginSchema = z.object({
    email,
    password: z.string({ required_error: "Password is required." }).min(1, "Password is required."),
});

// User / profile schemas

export const updateProfileSchema = z
    .object({
        firstName: name.optional(),
        lastName:  name.optional(),
        phone:     phone.nullable().optional(),
    })
    .refine(
        (data) => data.firstName || data.lastName || data.phone !== undefined,
        { message: "Provide at least one field to update." }
    );

export const changePasswordSchema = z
    .object({
        currentPassword: z.string({ required_error: "Current password is required." }).min(1),
        newPassword:     password,
    })
    .refine((data) => data.currentPassword !== data.newPassword, {
        path:    ["newPassword"],
        message: "New password must be different from the current password.",
    });

// Address schemas

export const createAddressSchema = z.object({
    label:     z.string().min(1, "Label is required.").max(32, "Label is too long.").trim(),
    street:    z.string().min(2, "Street address is required.").max(128).trim(),
    city:      z.string().min(1, "City is required.").max(64).trim(),
    county:    z.string().min(1, "County is required.").max(64).trim(),
    isDefault: z.boolean().optional().default(false),
});

export const updateAddressSchema = z
    .object({
        label:     z.string().min(1).max(32).trim().optional(),
        street:    z.string().min(2).max(128).trim().optional(),
        city:      z.string().min(1).max(64).trim().optional(),
        county:    z.string().min(1).max(64).trim().optional(),
        isDefault: z.boolean().optional(),
    })
    .refine(
        (data) => Object.keys(data).length > 0,
        { message: "Provide at least one field to update." }
    );

// Cart schemas

export const addCartItemSchema = z.object({
    productId,
    qty: z.coerce.number().int().min(1, "Quantity must be at least 1.").max(100).optional().default(1),
});

export const updateCartItemSchema = z.object({
    qty: z.coerce.number().int("Quantity must be a whole number.").min(0, "Quantity cannot be negative.").max(100),
});

export const applyCouponSchema = z.object({
    code: z.string({ required_error: "Coupon code is required." }).min(1, "Coupon code cannot be empty.").trim().toUpperCase(),
});

// Wishlist schemas

export const addWishlistSchema = z.object({
    productId,
});

// Product schemas (admin)

export const createProductSchema = z.object({
    name:          z.string().min(1, "Product name is required.").max(128).trim(),
    category:      z.string().min(1, "Category is required.").max(64).trim(),
    slug:          z.string().min(1, "Slug is required.").max(128).regex(/^[a-z0-9-]+$/, "Slug may only contain lowercase letters, numbers and hyphens.").trim(),
    price:         positiveInt("Price"),
    stock:         z.coerce.number().int().min(0, "Stock cannot be negative."),
    originalPrice: z.coerce.number().int().positive().optional().nullable(),
    active:        z.enum(["true", "false"]).optional().default("true"),
    deliveryFee:   z.coerce.number().int().min(0).optional().default(0),
});

export const updateProductSchema = z
    .object({
        name:          z.string().min(1).max(128).trim().optional(),
        category:      z.string().min(1).max(64).trim().optional(),
        slug:          z.string().min(1).max(128).regex(/^[a-z0-9-]+$/, "Slug may only contain lowercase letters, numbers and hyphens.").optional(),
        price:         z.coerce.number().int().positive().optional(),
        stock:         z.coerce.number().int().min(0).optional(),
        originalPrice: z.coerce.number().int().positive().optional().nullable(),
        active:        z.enum(["true", "false"]).optional(),
        replaceImages: z.enum(["true", "false"]).optional(),
        deliveryFee:   z.coerce.number().int().min(0).optional(),
    })
    .refine(
        (data) => Object.keys(data).length > 0,
        { message: "Provide at least one field to update." }
    );

// Order schemas

export const placeOrderSchema = z.object({
    contact: z.object({
        firstName: name,
        lastName:  name,
        email,
        phone,
    }),
    delivery: z.object({
        street: z.string().min(2, "Street address is required.").max(128).trim(),
        city:   z.string().min(1, "City is required.").max(64).trim(),
        county: z.string().min(1, "County is required.").max(64).trim(),
        notes:  z.string().max(256).trim().optional(),
    }),
    payment: z.object({
        method:   z.enum(["mpesa-stk", "manual"], {
            errorMap: () => ({ message: "payment.method must be 'mpesa-stk' or 'manual'." }),
        }),
        stkPhone: phone.optional(),
    }).refine(
        (data) => data.method !== "mpesa-stk" || !!data.stkPhone,
        { path: ["stkPhone"], message: "M-Pesa phone number is required for STK Push." }
    ),
});

export const updateOrderStatusSchema = z.object({
    status: z.enum(
        ["CONFIRMED", "PROCESSING", "DISPATCHED", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED"],
        { errorMap: () => ({ message: "status must be one of: CONFIRMED, PROCESSING, DISPATCHED, OUT_FOR_DELIVERY, DELIVERED, CANCELLED." }) }
    ),
});

// Payment schemas

export const stkPushSchema = z.object({
    orderId: z.string({ required_error: "orderId is required." }).cuid("Invalid order ID."),
    phone,
});

export const updatePaymentStatusSchema = z.object({
    status:             z.enum(["PENDING", "PAID", "FAILED"], {
        errorMap: () => ({ message: "status must be PENDING, PAID, or FAILED." }),
    }),
    mpesaReceiptNumber: z.string().trim().optional(),
});

// Auth — forgot / reset password / resend verification

export const forgotPasswordSchema = z.object({
    email,
});

export const resetPasswordSchema = z.object({
    token: z
        .string({ required_error: "Reset token is required." })
        .min(1, "Reset token cannot be empty."),
    password,
});

export const resendVerificationSchema = z.object({
    email,
});
