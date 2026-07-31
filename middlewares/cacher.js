import { Redis } from "@upstash/redis";
import { UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN } from "../config/env.js";

// Redis client
// Lazily initialised so the server boots even if the env vars are missing in
// local dev.  All cache ops are wrapped in try/catch — a Redis failure never
// breaks a real request; it just falls through to the database.

let redis = null;

function getRedis() {
    if (redis) return redis;
    if (!UPSTASH_REDIS_REST_URL || !UPSTASH_REDIS_REST_TOKEN) {
        return null;
    }
    redis = new Redis({
        url:   UPSTASH_REDIS_REST_URL,
        token: UPSTASH_REDIS_REST_TOKEN,
    });
    return redis;
}

// TTL constants (seconds)
export const TTL = {
    PRODUCTS_LIST:   60 * 5,   // 5 min  — product grid, changes only on admin write
    PRODUCT_SINGLE:  60 * 10,  // 10 min — single product detail page
};

// Key builders
// Deterministic cache keys derived from the request so that different query
// strings get independent cache entries.

export function productListKey(query = {}) {
    const { category = "", page = "1", limit = "8", sort = "", search = "" } = query;
    return `products:list:cat=${category}:pg=${page}:lim=${limit}:sort=${sort}:q=${search}`;
}

export function productSingleKey(id) {
    return `products:single:${id}`;
}

// Middleware factory
// Returns an Express middleware that:
//   1. Computes the cache key via the provided keyFn(req)
//   2. Returns the cached value immediately if present
//   3. Monkey-patches res.json so the response is stored after the handler runs

export function cacheResponse(keyFn, ttl) {
    return async (req, res, next) => {
        const client = getRedis();

        // No Redis configured — skip silently
        if (!client) return next();

        const key = keyFn(req);

        try {
            const cached = await client.get(key);
            if (cached !== null) {
                // Upstash already parses JSON for us
                return res.status(200).json(cached);
            }
        } catch (err) {
            console.warn("[cacher] Redis GET failed, falling through:", err.message);
            return next();
        }

        // Intercept res.json to store the response before it's sent
        const originalJson = res.json.bind(res);
        res.json = async (body) => {
            // Only cache successful responses
            if (res.statusCode === 200 || res.statusCode === 201) {
                try {
                    await client.set(key, body, { ex: ttl });
                } catch (err) {
                    console.warn("[cacher] Redis SET failed:", err.message);
                }
            }
            return originalJson(body);
        };

        next();
    };
}

// Cache invalidation helper
// Called from controllers after any write that changes product data.
// Scans and deletes all keys matching a prefix pattern so stale pages
// don't linger regardless of which query params were cached.

export async function invalidateProducts(id = null) {
    const client = getRedis();
    if (!client) return;

    try {
        // Always blow away the entire product list cache — any product change
        // (create, update, delete, toggle) can affect every paginated page.
        let cursor = 0;
        do {
            const [nextCursor, keys] = await client.scan(cursor, {
                match: "products:list:*",
                count: 100,
            });
            cursor = Number(nextCursor);
            if (keys.length > 0) {
                await client.del(...keys);
            }
        } while (cursor !== 0);

        // If a specific product ID was provided, also drop its single-product entry
        if (id) {
            await client.del(productSingleKey(id));
        }
    } catch (err) {
        console.warn("[cacher] Invalidation failed:", err.message);
    }
}
