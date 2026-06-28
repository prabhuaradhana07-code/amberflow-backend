# AmberFlow Project Brain (Knowledge Base)

This document serves as the overarching context and architecture guide for the **AmberFlow** e-commerce project. Provide this file to any AI assistant to instantly give it full context of the project without needing to read every file, saving significant token usage.

## 1. High-Level Architecture
- **Type:** Full-stack E-commerce Web Application (B2C & Multi-vendor capabilities).
- **Frontend:** Next.js (App Router), React, styled with standard CSS / Tailwind.
- **Backend:** Node.js, Express.js.
- **Database:** PostgreSQL (using `pg` pool).
- **Authentication:** JWT (JSON Web Tokens) with Bcrypt password hashing.
- **Hosting / Deployment:**
  - **Frontend:** Railway (Custom Domain: `amberflow.in`)
  - **Backend:** Railway (PostgreSQL + Node.js server)
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
- `/app/login` & `/app/register`: Authentication pages. Stores JWT in `localStorage`.
- `/app/product/[slug]`: Dynamic product details page.
- `/app/checkout`: Order processing and cart management.
- `/app/dashboard`: 
  - Central dashboard routing based on user role (Customer, Vendor, Admin).
  - Admins can change order statuses (Confirmed -> Shipped -> Delivered).

## 4. Key Security Implementations
- **SQL Injection:** Prevented by strictly using PostgreSQL parameterized queries (`$1, $2`).
- **Passwords:** Hashed using `bcryptjs`.
- **CORS:** Configured to allow cross-origin requests from the frontend domain.
- **Vulnerabilities Patched:**
  - **IPv6 Railway Fix:** Nodemailer is forced to use IPv4 DNS resolution to prevent `ENETUNREACH` errors on Railway.
  - **Multer:** Basic mimetype filtering implemented for image uploads.

## 5. Third-Party Integrations & Tools
- **Nodemailer:** Uses a Gmail App Password for transactional emails.
- **Grafana k6:** Used for load testing. The backend max capacity on the free tier is roughly around ~50-100 concurrent VUs before Vercel/Railway starts dropping connections (`tls: internal error` or `ENOTFOUND` due to DDoS protection).

## 6. Known Quirks / Important Notes
- **Local Storage Reliance:** The frontend relies heavily on `localStorage` for session management (`user` and `token` keys). If the admin panel shows blank records unexpectedly, it is usually because the JWT token expired.
- **File Uploads:** Since uploads are stored locally on the Railway container (`/uploads`), images might be lost if the Railway container is completely rebuilt without persistent volume storage. 
- **Railway DNS:** Railway's `.up.railway.app` domains can sometimes drop (`ENOTFOUND`) under heavy DoS loads. If this happens, delete and regenerate the public domain in the Railway dashboard.
