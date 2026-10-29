# AmberFlow Project Brain (Knowledge Base)

This document serves as the overarching context and architecture guide for the **AmberFlow** e-commerce project. Provide this file to any AI assistant to instantly give it full context of the project without needing to read every file, saving significant token usage.

## 1. High-Level Architecture
- **Type:** Full-stack E-commerce Web Application (B2C & Multi-vendor capabilities).
- **Frontend:** Next.js (App Router), React, styled with standard CSS / Tailwind.
- **Backend:** Node.js, Express.js.
- **Database:** PostgreSQL (using `pg` pool).
- **Authentication:** JWT (JSON Web Tokens) with Bcrypt password hashing.
- **Hosting / Deployment:**
  - **Frontend:** Vercel (Custom Domain: `amberflow.in`, Repository: `amberflow-frontend`, Root Directory: `/frontend`)
  - **Backend:** Render (Free Web Service: `https://amberflow-backend.onrender.com`, Repository: `amberflow-backend` with Root Directory set to `/backend`)
  - **Database:** Supabase (Free PostgreSQL database with connection pooling)
  - **File Storage:** Local disk storage via `multer` (served via `/uploads` static route on the backend).

## 2. User Roles & Permissions
The system supports three distinct roles (`users.role`):
1. **`customer`**: Can browse products, place orders, and view their own order history.
2. **`vendor`**: Can create, update, and delete their own products. Can view orders that contain their products. Requires `is_approved_vendor = true` to list products.
3. **`admin`**: Full access. Can view all orders across the platform, manage all products, approve vendors, and update order statuses.

## 3. Core Directory Structure

### `/backend` (Node.js/Express)
- `index.js`: Main entry point. Configures CORS, static uploads folder, and mounts routes.
- `db.js`: PostgreSQL connection pool setup.
- `/routes`:
  - `auth.js`: Registration, Login, Forgot Password (OTP via Email), Profile management.
  - `products.js`: CRUD operations for products. Uses `node-cache` for performance.
  - `orders.js`: Checkout logic, promo codes (`NEW15`), order history, vendor-specific stats.
  - `reviews.js`: Product reviews and ratings.
- `/middleware`:
  - `auth.js`: Verifies JWT tokens and attaches `req.user`.
  - `upload.js`: Multer configuration for handling image uploads (max 5MB, strict extensions).
- `/utils`:
  - `email.js`: Nodemailer setup for sending OTPs and Order Confirmations via Gmail.

### `/frontend` (Next.js App Router)
- `/.env`: Contains `NEXT_PUBLIC_API_URL` pointing to the backend.
- `/app/login` & `/app/register`: Authentication pages. Uses `credentials: 'include'` for secure HttpOnly cookie sessions.
- `/app/product/[slug]`: Dynamic product details page.
- `/app/checkout`: Order processing and cart management.
- `/app/dashboard`: 
  - Central dashboard routing based on user role (Customer, Vendor, Admin).
  - Admins can change order statuses (Confirmed -> Shipped -> Delivered).

## 4. Key Security Implementations
- **SQL Injection:** Prevented by strictly using PostgreSQL parameterized queries (`$1, $2`).
- **Passwords:** Hashed using `bcryptjs` with salt factor 10.
- **Password Rotation:** Dedicated protected endpoint `PUT /api/auth/change-password` rate-limited under `authLimiter` (20 attempts/15m), requiring verification of `currentPassword` before updating. UI controls integrated into both the Profile tab (`/dashboard`) and Admin Portal (`/admin` -> Security tab).
- **Authentication (Cookies):** JWT is signed with a 256-bit cryptographically secure random key, stored in an `HttpOnly`, `Secure` cookie with `SameSite: 'none'`.
- **CORS:** Strictly whitelisted to `amberflow.in`, `www.amberflow.in`, and `amberflow-frontend-deug.vercel.app`.
- **Rate Limiting:** `express-rate-limit` enabled (300 requests/15m general; 20 attempts/15m for auth).
- **Security Headers:** Enforced via `helmet` on the backend and strict headers in `next.config.mjs` (HSTS, nosniff, SAMEORIGIN, Referrer-Policy, Permissions-Policy).
- **Price & Stock Integrity:** Server-side price lookups and row locking (`FOR UPDATE`); client prices cannot be tampered with.
- **File Uploads:** Strict extension & MIME cross-verification; KYC identity documents (Aadhaar & PAN) stored in protected `uploads/kyc/` accessible only to admins; public product & review uploads reject `.pdf` and accept only verified images (`.jpg`, `.jpeg`, `.png`, `.webp`).
- **Email Injection Defense:** Transactional HTML emails sanitize and escape all user dynamic variables (`escapeHtml`) to prevent Email HTML Injection & Phishing Spoofing.
- **Review Integrity & DoS Protection:** Product reviews enforce verified purchase checks (user must have a non-cancelled order containing the product) and comments are capped at 1,000 characters.
- **SSRF Prevention:** Next.js image remotePatterns locked to explicit trusted domains (Unsplash, Render backend, AmberFlow).
- **CSP Directives:** Enforced with `frame-ancestors 'self'; base-uri 'self'; object-src 'none';`.
- **CSV Injection:** Sanitized formula trigger characters (`=`, `+`, `-`, `@`) in admin CSV exports.
- **Supabase Database Hardening (RLS & PostgREST Access):** All public tables (`users`, `vendor_details`, `password_reset_codes`, `orders`, `order_items`, `products`, `reviews`, `promo_usage`) have Row Level Security (`RLS`) enabled, and all direct privileges have been revoked from `anon` and `authenticated` roles. This eliminates the vulnerability where public PostgREST API endpoints could expose sensitive tables. Backend queries continue uninterrupted via the `postgres` pool.

## 5. Third-Party Integrations & Tools
- **Nodemailer:** Uses a Gmail App Password for transactional emails.
- **Grafana k6:** Used for load testing. The backend max capacity on the free tier is roughly around ~50-100 concurrent VUs before Vercel/Railway starts dropping connections (`tls: internal error` or `ENOTFOUND` due to DDoS protection).

## 6. Known Quirks / Important Notes
- **Dual-Repository Syncing:** The local environment is a monorepo containing both `/frontend` and `/backend`. However, Railway deploys them from *two separate* GitHub repositories (`amberflow-frontend` and `amberflow-backend`). If you make backend changes, you MUST forcefully push the monolithic `main` branch to the `backend` git remote so Railway detects it.
- **Railway Monorepo Setup:** The `amberflow-backend` Railway project requires the **Root Directory** to be explicitly set to `/backend` in the dashboard settings since the repo structure contains the app inside a folder.
- **File Uploads:** Since uploads are stored locally on the Railway container (`/uploads`), images might be lost if the Railway container is completely rebuilt without persistent volume storage. 
- **Railway DNS:** Railway's `.up.railway.app` domains can sometimes drop (`ENOTFOUND`) under heavy DoS loads. If this happens, delete and regenerate the public domain in the Railway dashboard.
