import { PrismaClient } from "../generated/prisma/index.js";

// Single PrismaClient instance for the lifetime of the process.
// connection_limit and pool_timeout are set in DATABASE_URL in .env.
// The global singleton guard is kept for hot-reload safety in development
// (nodemon re-executes this module on every restart but globalThis persists).

const globalForPrisma = globalThis;

const prisma = globalForPrisma.prisma ?? new PrismaClient({
    log: process.env.NODE_ENV === "development"
        ? ["warn", "error"]   // omit "query" — too noisy; add back when debugging slow queries
        : ["error"],
});

if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = prisma;
}

export default prisma;
