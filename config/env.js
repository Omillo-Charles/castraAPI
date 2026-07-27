import { config } from "dotenv";

config({path: ".env"})

export const {
    PORT,
    NODE_ENV,
    BACKEND_URL,
    FRONTEND_URL,
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_CALLBACK_URL,
    JWT_SECRET,
    JWT_EXPIRY
} = process.env