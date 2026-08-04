# Castra API

REST API backend for [Castra Households](https://castrahouseholds.co.ke) — a Kenyan household essentials e-commerce platform. Built with Express.js, Prisma, and PostgreSQL (Neon serverless).

---

## Table of Contents

- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Database Schema](#database-schema)
- [API Reference](#api-reference)
- [Authentication](#authentication)
- [Middleware Stack](#middleware-stack)
- [Email System](#email-system)
- [Payment System](#payment-system)
- [Caching](#caching)
- [Error Monitoring](#error-monitoring)
- [Environment Variables](#environment-variables)
- [Running Locally](#running-locally)

---

## Tech Stack

| Package | Version | Purpose |
|---------|---------|---------|
| Node.js | 18+ | Runtime |
| Express | 4.22 | HTTP framework |
| Prisma | 6.19 | ORM + schema migrations |
| PostgreSQL (Neon) | — | Primary database |
| `bcryptjs` | 2.4 | Password hashing |
| `jsonwebtoken` | 9.0 | Access + refresh tokens (JWT) |
| `passport` / `passport-google-oauth20` | 0.7 / 2.0 | Google OAuth 2.0 |
| `@upstash/redis` | 1.34 | Response caching |
| `cloudinary` | 2.6 | Product image storage |
| `resend` | 4.6 | Transactional email delivery |
| `@sentry/node` | 8.55 | Error monitoring + performance tracing |
| `zod` | 3.25 | Request body validation |
| `helmet` | 8.0 | HTTP security headers |
| `express-rate-limit` | 7.5 | Rate limiting per route group |
| `multer` | 1.4 | Multipart file uploads |
| `axios` | 1.7 | M-Pesa Daraja HTTP calls |
| `cookie-parser` | 1.4 | HTTP-only cookie parsing |

The project uses **ES Modules** (`"type": "module"`) throughout.

---

## Project Structure

```
castraAPI/
├── app.js                    # Express app — middleware stack, routes, server boot
├── prisma/
│   └── schema.prisma         # Prisma schema — source of truth for all models
├── generated/
│   └── prisma/               # Generated Prisma client (do not edit manually)
├── config/
│   ├── cloudinary.js         # Cloudinary SDK setup + multer storage engine
│   ├── env.js                # Centralised exports of all process.env vars
│   ├── mpesa.js              # Safaricom Daraja STK Push helpers + callback parser
│   ├── passport.js           # Google OAuth Passport strategy
│   └── resend.js             # Resend client initialisation + sendMail() helper
├── controllers/
│   ├── auth.controller.js    # Register, login, logout, refresh, Google OAuth,
│   │                         #   forgot/reset password, email verify + resend
│   ├── cart.controller.js    # Cart CRUD + coupon application (user + guest)
│   ├── order.controller.js   # Place order, list, track, get, update status
│   ├── payment.controller.js # STK push, status polling, Daraja callback, admin update
│   ├── product.controller.js # Product CRUD, toggle active/inactive
│   ├── user.controller.js    # Profile read/update, password change, account delete
│   ├── wishlist.controller.js# Wishlist add/remove/check
│   └── adresses.controller.js# Saved address CRUD
├── routes/
│   ├── auth.routes.js
│   ├── cart.routes.js
│   ├── order.routes.js
│   ├── payment.routes.js
│   ├── product.routes.js
│   ├── user.routes.js
│   ├── wishlist.routes.js
│   └── adresses.routes.js
├── middlewares/
│   ├── cacher.js             # Upstash Redis response cache + invalidation helpers
│   ├── error.js              # AppError class + global Express error handler
│   ├── logger.js             # Sentry init + logger wrapper (info/warn/error)
│   ├── rateLimiter.js        # Global, auth, STK, public, and admin write limiters
│   ├── requireAuth.js        # JWT verification middleware + requireAdmin guard
│   ├── resolveCart.js        # Resolves cart owner — authenticated user or guest session
│   ├── safaricomOnly.js      # IP allowlist for Safaricom Daraja callback route
│   └── validator.js          # Zod schemas + validate() middleware factory
├── emails/
│   ├── resetPassword.js      # Password reset HTML + text email template
│   └── verifyEmail.js        # Email verification HTML + text template
├── utils/
│   └── emailTemplates.js     # Order confirmed, status update, payment, admin alert
└── database/
    └── neon.js               # Prisma client singleton (global for hot-reload safety)
```

---

## Database Schema

Prisma schema is at `prisma/schema.prisma`. The database has 11 models.

### Enums

```
Role           → USER | ADMIN
OrderStatus    → CONFIRMED | PROCESSING | DISPATCHED | OUT_FOR_DELIVERY | DELIVERED
PaymentMethod  → MPESA_STK | MPESA_MANUAL
PaymentStatus  → PENDING | PAID | FAILED
```

### Models

#### `users`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `cuid` | Primary key |
| `firstName`, `lastName` | `String` | |
| `email` | `String` | Unique |
| `phone` | `String?` | |
| `password` | `String?` | Null for Google OAuth accounts |
| `googleId` | `String?` | Unique |
| `role` | `Role` | Default: `USER` |
| `emailVerified` | `Boolean` | Default: `false` |
| `resetPasswordToken` | `String?` | SHA-256 hash, unique, 1h TTL |
| `resetPasswordExpiry` | `DateTime?` | |
| `verifyEmailToken` | `String?` | SHA-256 hash, unique, 24h TTL |
| `verifyEmailExpiry` | `DateTime?` | |

#### `products`

| Column | Type | Notes |
|--------|------|-------|
| `name`, `category`, `slug` | `String` | |
| `price` | `Int` | KES, whole shillings |
| `deliveryFee` | `Int` | Default: 0 |
| `originalPrice` | `Int?` | Crossed-out price UI |
| `stock` | `Int` | |
| `inStock` | `Boolean` | Auto-managed on stock change |
| `active` | `Boolean` | Admin toggle — hides from public when false |
| `images` | `String[]` | Cloudinary URLs |

#### `orders`

Contact and delivery details are snapshotted at order time — they survive any subsequent address or account edits.

| Column | Type | Notes |
|--------|------|-------|
| `ref` | `String` | Unique, e.g. `CST-20250804-1234` |
| `userId` | `String?` | Null for guest orders |
| `sessionId` | `String?` | Guest identifier |
| `status` | `OrderStatus` | Default: `CONFIRMED` |
| `subtotal`, `deliveryFee`, `discount`, `total` | `Int` | KES |
| `firstName`, `lastName`, `email?`, `phone` | Snapshot | |
| `street`, `city`, `county`, `notes?` | Snapshot | |

#### `payments`

| Column | Type | Notes |
|--------|------|-------|
| `orderId` | `String` | Unique, one payment per order |
| `method` | `PaymentMethod` | `MPESA_STK` or `MPESA_MANUAL` |
| `status` | `PaymentStatus` | Default: `PENDING` |
| `amount` | `Int` | KES |
| `stkPhone` | `String?` | Phone that received the STK prompt |
| `checkoutRequestId` | `String?` | Daraja ID for polling |
| `mpesaReceiptNumber` | `String?` | Confirmed M-Pesa receipt |

Other models: `Address`, `Cart`, `CartItem`, `Wishlist`, `WishlistItem`, `OrderItem`, `RefreshToken`.

---

## API Reference

Base URL: `/api/v1`

### Auth — `/api/v1/auth`

| Method | Path | Auth | Rate limited | Description |
|--------|------|------|-------------|-------------|
| `POST` | `/register` | — | ✅ | Create account, send verification email |
| `POST` | `/login` | — | ✅ | Email + password login, issues token pair |
| `POST` | `/logout` | — | — | Revokes refresh token, clears cookies |
| `POST` | `/refresh` | — | — | Rotate refresh token, issue new access token |
| `GET` | `/me` | ✅ User | — | Get current user profile |
| `POST` | `/forgot-password` | — | ✅ | Send reset link (always 200, timing-safe) |
| `POST` | `/reset-password` | — | ✅ | Validate token + set new password |
| `GET` | `/verify-email?token=` | — | — | Verify email via link (redirects to frontend) |
| `POST` | `/resend-verification` | — | ✅ | Resend verification email (always 200) |
| `GET` | `/google` | — | — | Redirect to Google OAuth consent screen |
| `GET` | `/google/callback` | — | — | Google OAuth callback, issues token pair |

### Users — `/api/v1/users`

All routes require authentication.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/me` | Get full profile |
| `PATCH` | `/me` | Update name or phone |
| `PATCH` | `/me/password` | Change password (current password required) |
| `DELETE` | `/me` | Permanently delete account + all data |

### Products — `/api/v1/products`

| Method | Path | Auth | Cached | Description |
|--------|------|------|--------|-------------|
| `GET` | `/` | — | ✅ | List products. Query: `category`, `page`, `limit`, `sort`, `search`. Kicks excluded from "All" view |
| `GET` | `/:id` | — | ✅ | Get single product by ID |
| `POST` | `/` | 🔒 Admin | — | Create product (multipart, up to 5 images) |
| `PATCH` | `/:id` | 🔒 Admin | — | Update product fields + images |
| `DELETE` | `/:id` | 🔒 Admin | — | Delete product + purge Cloudinary images |
| `PATCH` | `/:id/toggle` | 🔒 Admin | — | Toggle product active/inactive |

### Cart — `/api/v1/cart`

Works for authenticated users and anonymous guests (resolved via `resolveCart` middleware).

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | Get cart with items and computed totals |
| `POST` | `/items` | Add item. Increments quantity if already present |
| `PUT` | `/items/:productId` | Set exact quantity (pass `qty: 0` to remove) |
| `DELETE` | `/items/:productId` | Remove specific item |
| `DELETE` | `/` | Clear cart and reset coupon |
| `POST` | `/coupon` | Apply coupon code |

### Wishlist — `/api/v1/wishlist`

All routes require authentication.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | Get full wishlist with product details |
| `POST` | `/` | Add product (idempotent) |
| `DELETE` | `/:productId` | Remove product |
| `GET` | `/check/:productId` | Returns `{ wishlisted: boolean }` |

### Orders — `/api/v1/orders`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/track?q=` | — | Public tracking by order ref or phone number |
| `POST` | `/` | User / Guest | Place order from active cart. Triggers stock deduction, emails, optional STK push |
| `GET` | `/` | ✅ User | List own orders. Admin: list all orders with search + status filter |
| `GET` | `/customers` | 🔒 Admin | Customer list derived from order history |
| `GET` | `/:idOrRef` | ✅ User | Get single order by ID or ref |
| `PATCH` | `/:id/status` | 🔒 Admin | Update fulfillment status, triggers status email |

### Payments — `/api/v1/payments`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/stkpush` | ✅ User | Initiate M-Pesa STK Push for an order |
| `GET` | `/status/:checkoutRequestId` | ✅ User | Poll STK payment status |
| `PATCH` | `/:id/status` | 🔒 Admin | Manually confirm or fail a payment |
| `POST` | `/mpesa/callback` | 🛡️ Safaricom IPs | Daraja STK result callback (also at `/payment/mpesa/callback`) |

### Addresses — `/api/v1/addresses`

All routes require authentication.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | List all saved addresses |
| `POST` | `/` | Create address |
| `PATCH` | `/:id` | Update address fields |
| `PATCH` | `/:id/default` | Set as default address |
| `DELETE` | `/:id` | Delete address |

---

## Authentication

The API uses a **stateless dual-token system delivered via HTTP-only cookies**. No tokens are stored in `localStorage` or `sessionStorage`.

### Tokens

| Token | Cookie name | Expiry | Contains |
|-------|------------|--------|---------|
| Access token | `token` | 15 minutes | `{ id, email, role }` |
| Refresh token | `refresh_token` | 7 days | `{ id }` |

The refresh token cookie is scoped to `/api/v1/auth` so it is never sent on non-auth requests.

### Refresh token storage

The raw refresh token is **never stored in the database**. Only its SHA-256 hash is saved in the `refresh_tokens` table. On every `/refresh` call the old hash is deleted and a new pair is issued, making replayed tokens useless.

### Google OAuth flow

1. Browser navigates to `GET /auth/google` → Passport redirects to Google
2. Google redirects to `GET /auth/google/callback` → Passport validates the code
3. If the Google account email matches an existing user, that account is linked. Otherwise a new account is created (no password set)
4. The same JWT token pair is issued and set as cookies, then the user is redirected to the appropriate dashboard

---

## Middleware Stack

Request processing order in `app.js`:

```
1. sentryRequestHandler        — wrap each request in a Sentry transaction
2. CORS                        — allow frontend origin + production domain with credentials
3. Helmet                      — HTTP security headers
4. express.json ({ limit: 50kb })
5. cookieParser
6. express.urlencoded
7. globalLimiter               — applies to every route
8. passport.initialize()       — stateless, no sessions
9. Routes (/api/v1/...)
10. notFoundHandler            — 404 for unmatched routes
11. sentryErrorHandler         — capture unhandled errors before the app handler
12. errorHandler               — normalise + respond
```

### `resolveCart`

Used on cart and order routes. Identifies the cart owner without requiring login:
- If the request has a valid JWT → `req.cartOwner = { type: "user", userId }`
- Otherwise reads/creates a signed `sessionId` cookie → `req.cartOwner = { type: "guest", sessionId }`

### `safaricomOnly`

Applied exclusively to the Daraja M-Pesa callback route. Checks `req.ip` against Safaricom's published CIDR blocks. In non-production environments it passes through and logs the IP. Always returns `200` on rejection (so Daraja doesn't keep retrying).

### `cacheResponse`

Wraps route handlers with an Upstash Redis GET → handler → SET pipeline. The cache key is computed from a function passed at route registration time (e.g. `productListKey(req.query)`). Write operations call `invalidateProducts()` which scans and deletes all `products:list:*` keys.

### `errorHandler`

Handles and normalises:
- **Prisma errors** — maps `P2002` (unique violation), `P2025` (not found), `P2003` (foreign key) etc. to HTTP 409/404/400
- **JWT errors** — `JsonWebTokenError` → 401, `TokenExpiredError` → 401
- **Multer errors** — file size, count, and unexpected field errors → 400/413
- **Operational `AppError`** — responds with the thrown status code and message
- **Unknown errors** — logs + captures in Sentry, responds with a generic 500

---

## Email System

All emails are sent via **Resend**. The `sendMail()` helper in `config/resend.js` is a drop-in wrapper that gracefully no-ops in development when `RESEND_API_KEY` is not configured (logs to console instead of throwing).

Templates use inline HTML styles only — no `<style>` blocks — for broad email client compatibility. The design uses a dark card layout consistent with the Castra brand.

| Template file | Trigger | Recipient |
|--------------|---------|-----------|
| `emails/verifyEmail.js` | User registers | Customer |
| `emails/resetPassword.js` | Forgot password request | Customer |
| `utils/emailTemplates.js` → `buildUserOrderEmail` | Order placed | Customer |
| `utils/emailTemplates.js` → `buildOrderStatusEmail` | Admin updates order status | Customer |
| `utils/emailTemplates.js` → `buildAdminOrderEmail` | Order placed | Admin (`ADMIN_EMAIL`) |
| `utils/emailTemplates.js` → `buildPaymentStatusEmail` | Admin confirms/fails payment | Customer |

All order and payment emails are fire-and-forget — failures are logged to Sentry but never propagate to the HTTP response.

---

## Payment System

### Manual M-Pesa (`MPESA_MANUAL`) — active

The customer pays using their M-Pesa app:

- **Paybill:** Business no. `542542`, Account no. `03703439943450`
- **Send Money:** `0704147774` (Laureen Nyaboke Maina)

The order is created with `status: PENDING`. An admin confirms receipt from the dashboard once they see the M-Pesa notification, triggering `PATCH /api/v1/payments/:id/status`.

### STK Push (`MPESA_STK`) — wired, UI disabled

When live Safaricom Daraja credentials are available:

1. `POST /api/v1/orders` calls `initiateSTKPush()` if `stkPhone` is provided
2. Daraja sends a push notification to the customer's phone
3. The frontend polls `GET /api/v1/payments/status/:checkoutRequestId` every 5 seconds for up to 60 seconds
4. Safaricom POSTs the result to `POST /api/v1/payments/mpesa/callback`
5. The callback handler updates the payment status with an idempotency guard — terminal states (`PAID`, `FAILED`) are never overwritten

To re-enable STK in the UI, remove the `disabled` attribute from the STK tab button in `app/checkout/page.tsx` on the frontend.

---

## Caching

Product list and single-product responses are cached in **Upstash Redis**.

```
Cache key format:
  products:list:<base64(querystring)>  — list queries
  products:single:<id>                 — single product

TTL:
  products:list    — configurable via TTL.PRODUCTS_LIST in cacher.js
  products:single  — configurable via TTL.PRODUCT_SINGLE
```

The cache is invalidated automatically on every admin write (create, update, delete, toggle). `invalidateProducts()` scans and deletes all `products:list:*` keys regardless of query params, ensuring stale pages never persist across product changes.

---

## Error Monitoring

Sentry is initialised in `middlewares/logger.js`. This file **must be the first import in `app.js`** so Sentry's auto-instrumentation can wrap Express, http, and Prisma before any handlers are registered.

The `logger` object is the sole logging interface across the codebase — no raw `console.*` calls:

```js
import { logger } from "../middlewares/logger.js";

logger.info("Database connected");
logger.warn("Redis GET failed: " + err.message);
logger.error("STK push failed", err);          // captures to Sentry
logger.captureException(err, { orderId });      // explicit capture with context
logger.setUser({ id, email, role });            // attach to Sentry scope after auth
logger.clearUser();                              // clear on logout
```

**`beforeSend` filter** — operational `AppError`s and all 4xx responses are suppressed from Sentry. Only genuine unexpected 5xx errors and uncaught exceptions reach the issue tracker.

**Trace sample rates** — `1.0` in development, `0.2` in production (configurable).

---

## Environment Variables

Copy `.env` and fill in each value. The `config/env.js` file re-exports all variables as named constants — import from there rather than reading `process.env` directly in controllers.

```env
# ── Server ──────────────────────────────────────────────────────────────────
PORT=5500
NODE_ENV=development
BACKEND_URL=http://localhost:5500
FRONTEND_URL=http://localhost:3000

# ── Google OAuth ─────────────────────────────────────────────────────────────
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALLBACK_URL=http://localhost:5500/auth/google/callback

# ── JWT ──────────────────────────────────────────────────────────────────────
JWT_SECRET=                     # min 64 random hex chars
JWT_REFRESH_SECRET=             # different from JWT_SECRET
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# ── Database (Neon PostgreSQL) ────────────────────────────────────────────────
DATABASE_URL=postgresql://...?sslmode=require&connect_timeout=30&pool_timeout=30&connection_limit=3

# ── Cloudinary ───────────────────────────────────────────────────────────────
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

# ── M-Pesa (Safaricom Daraja) ─────────────────────────────────────────────────
MPESA_ENV=sandbox              # sandbox | production
MPESA_CONSUMER_KEY=
MPESA_CONSUMER_SECRET=
MPESA_BUSINESS_SHORT_CODE=
MPESA_PASSKEY=
MPESA_CALLBACK_URL=            # must be a public HTTPS URL

# ── Email (Resend) ────────────────────────────────────────────────────────────
RESEND_API_KEY=
RESEND_FROM=Castra Households <info@castrahouseholds.co.ke>
ADMIN_EMAIL=                   # receives new order alert emails

# ── Cache (Upstash Redis) ─────────────────────────────────────────────────────
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# ── Monitoring (Sentry) ───────────────────────────────────────────────────────
SENTRY_DSN=                    # from Sentry → Project Settings → Client Keys
SENTRY_ENVIRONMENT=development
```

> **DATABASE_URL connection params:** `connect_timeout=30` gives Neon's serverless database enough time to wake from a cold start. `pool_timeout=30` overrides Prisma's default 10s timeout. `connection_limit=3` keeps the connection pool lean for a serverless database.

---

## Running Locally

```bash
# 1. Install dependencies
npm install

# 2. Copy and fill in environment variables
cp .env.example .env

# 3. Push the Prisma schema to your database
npx prisma db push

# 4. Start the development server (hot reload via nodemon)
npm run dev

# 5. Start the production server
npm start
```

The API runs on `http://localhost:5500`.

### Useful Prisma commands

```bash
# Inspect the current database state
npx prisma studio

# Re-generate the Prisma client after schema changes
npx prisma generate

# Push schema changes to the database without creating a migration file
npx prisma db push
```
