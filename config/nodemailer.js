import nodemailer from "nodemailer";
import {
    SMTP_HOST,
    SMTP_PORT,
    SMTP_SECURE,
    SMTP_USER,
    SMTP_PASS,
    MAIL_FROM_NAME,
    MAIL_FROM_EMAIL,
    NODE_ENV,
} from "./env.js";

const transportConfig = {
    host: SMTP_HOST,
    port: Number(SMTP_PORT || 587),
    secure: SMTP_SECURE === "true",
    auth: SMTP_USER && SMTP_PASS
        ? {
            user: SMTP_USER,
            pass: SMTP_PASS,
        }
        : undefined,
};

export const transporter = nodemailer.createTransport(transportConfig);

export async function verifyMailerConnection() {
    try {
        await transporter.verify();
        if (NODE_ENV !== "test") {
            console.log("[nodemailer] Mailer connection verified.");
        }
        return true;
    } catch (error) {
        console.warn("[nodemailer] Mailer verification failed:", error.message);
        return false;
    }
}

export async function sendMail({
    to,
    subject,
    html,
    text,
    from,
}) {
    if (!to || !subject) {
        throw new Error("Recipient and subject are required for email delivery.");
    }

    const mailOptions = {
        from: from || `${MAIL_FROM_NAME || "Castra"} <${MAIL_FROM_EMAIL || SMTP_USER}>`,
        to,
        subject,
        text,
        html,
    };

    return transporter.sendMail(mailOptions);
}
