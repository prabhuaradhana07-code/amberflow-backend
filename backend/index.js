const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

// Import routes and middlewares
const productRoutes = require('./routes/products');
const orderRoutes  = require('./routes/orders');
const authRoutes   = require('./routes/auth');
const reviewRoutes = require('./routes/reviews');
const authMiddleware = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 5000;

// Trust reverse proxy (Render, Vercel, Cloudflare) for accurate req.ip in rate limiters
app.set('trust proxy', 1);

// ── Security Headers via Helmet ────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false // Handled on frontend
}));

// ── Rate Limiting ──────────────────────────────────────────────
// General limiter: 300 requests per 15 minutes per IP
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' }
});
app.use('/api/', generalLimiter);

// Strict limiter for authentication endpoints: 20 attempts per 15 minutes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login or registration attempts. Please wait 15 minutes before trying again.' }
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/register-vendor', authLimiter);
app.use('/api/auth/forgot-password', authLimiter);
app.use('/api/auth/reset-password', authLimiter);
app.use('/api/auth/change-password', authLimiter);

// ── CORS Configuration ─────────────────────────────────────────
const allowedOrigins = new Set([
  'http://localhost:3000',
  'https://amberflow.in',
  'https://www.amberflow.in',
  'https://amberflow-frontend-deug.vercel.app'
]);

if (process.env.FRONTEND_URL) {
  allowedOrigins.add(process.env.FRONTEND_URL.replace(/\/$/, ''));
}

app.use(cors({
  origin: function (origin, callback) {
    // Allow server-to-server or health check calls with no origin
    if (!origin) return callback(null, true);

    const cleanOrigin = origin.replace(/\/$/, '');
    if (allowedOrigins.has(cleanOrigin)) {
      return callback(null, true);
    }
    return callback(new Error('Blocked by CORS policy'));
  },
  credentials: true
}));

// ── Body Parser with safe limits ──────────────────────────────
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));
app.use(cookieParser());

// ── Secure File Upload Storage ─────────────────────────────────
const uploadDir = path.join(__dirname, 'uploads');
const kycDir = path.join(__dirname, 'uploads/kyc');

if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
if (!fs.existsSync(kycDir)) fs.mkdirSync(kycDir, { recursive: true });

// Protected KYC documents: ONLY admin can view
app.get('/uploads/kyc/:filename', authMiddleware, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied. Administrator permissions required.' });
  }

  // Prevent directory traversal
  const safeFilename = path.basename(req.params.filename);
  const filePath = path.join(kycDir, safeFilename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Document not found.' });
  }

  res.sendFile(filePath);
});

// ── Document Uploads for Project 1 / BatchTrace (Invoices & Lab Certificates) ──
const docDir = path.join(__dirname, 'uploads/documents');
if (!fs.existsSync(docDir)) fs.mkdirSync(docDir, { recursive: true });

const docStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, docDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    const cleanBase = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 30);
    const unique = Date.now() + '-' + crypto.randomBytes(6).toString('hex');
    cb(null, `${cleanBase}-${unique}${ext}`);
  }
});

const docFilter = (req, file, cb) => {
  const allowedExts = new Set(['.pdf', '.jpg', '.jpeg', '.png', '.webp']);
  const ext = path.extname(file.originalname).toLowerCase();
  if (!allowedExts.has(ext)) {
    return cb(new Error('Invalid document format. Only PDF, JPG, PNG, and WebP files are allowed.'));
  }
  cb(null, true);
};

const uploadDoc = multer({
  storage: docStorage,
  fileFilter: docFilter,
  limits: { fileSize: 15 * 1024 * 1024 } // 15MB max limit
});

// Endpoint to upload real invoices and lab reports
app.post('/api/documents/upload', uploadDoc.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file was uploaded.' });
  }

  const host = req.get('host');
  const protocol = req.headers['x-forwarded-proto'] || req.protocol;
  const baseUrl = process.env.BACKEND_URL || `${protocol}://${host}`;
  const fileUrl = `${baseUrl}/uploads/documents/${req.file.filename}`;

  res.json({
    success: true,
    url: fileUrl,
    filename: req.file.originalname,
    storedFilename: req.file.filename,
    mimetype: req.file.mimetype,
    size: req.file.size
  });
});

// Dedicated secure route to serve uploaded documents with inline disposition
app.get('/uploads/documents/:filename', (req, res) => {
  const safeFilename = path.basename(req.params.filename);
  const filePath = path.join(docDir, safeFilename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Document not found.' });
  }

  res.sendFile(filePath);
});

// Public uploads for product images ONLY (prevent access to kyc or other subdirs)
app.use('/uploads', (req, res, next) => {
  // Block any attempt to access /uploads/kyc via the static handler
  if (req.path.startsWith('/kyc')) {
    return res.status(403).json({ error: 'Direct access to identity documents is prohibited.' });
  }
  next();
}, express.static(uploadDir));

// ── Route Mounting ─────────────────────────────────────────────
app.use('/api/products', productRoutes);
app.use('/api/orders',   orderRoutes);
app.use('/api/auth',     authRoutes);
app.use('/api/reviews',  reviewRoutes);

// Health check
app.get('/', (req, res) => res.json({ message: 'AmberFlow API running' }));

// ── Centralized Error Handling ─────────────────────────────────
app.use((err, req, res, next) => {
  if (err.message === 'Blocked by CORS policy') {
    return res.status(403).json({ error: 'Origin not allowed by CORS' });
  }

  console.error('Unhandled Application Error:', err);
  const isDev = process.env.NODE_ENV !== 'production';
  res.status(err.status || 500).json({
    error: isDev ? err.message : 'An unexpected server error occurred.'
  });
});

app.listen(PORT, () => console.log(`AmberFlow API on port ${PORT}`));
