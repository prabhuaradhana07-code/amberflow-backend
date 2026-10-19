const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.pdf']);
const ALLOWED_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf'
]);

// Setup storage engine
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Separate KYC documents from public uploads
    if (file.fieldname === 'aadhaar_doc' || file.fieldname === 'pan_doc') {
      const kycDir = path.join(__dirname, '../uploads/kyc/');
      if (!fs.existsSync(kycDir)) {
        fs.mkdirSync(kycDir, { recursive: true });
      }
      cb(null, kycDir);
    } else {
      const publicDir = path.join(__dirname, '../uploads/');
      if (!fs.existsSync(publicDir)) {
        fs.mkdirSync(publicDir, { recursive: true });
      }
      cb(null, publicDir);
    }
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueSuffix = crypto.randomBytes(16).toString('hex') + '-' + Date.now();
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});

const KYC_FIELDS = new Set(['aadhaar_doc', 'pan_doc']);
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);

// Strict file filter
const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const isKyc = KYC_FIELDS.has(file.fieldname);

  if (isKyc) {
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return cb(new Error('Invalid KYC file extension. Only jpg, jpeg, png, webp, and pdf are allowed.'), false);
    }
    if (!ALLOWED_MIMES.has(file.mimetype)) {
      return cb(new Error('Invalid KYC file type. Mimetype does not match allowed types.'), false);
    }
    if (ext === '.pdf' && file.mimetype !== 'application/pdf') {
      return cb(new Error('Mismatched file extension and type.'), false);
    }
    if (ext !== '.pdf' && !file.mimetype.startsWith('image/')) {
      return cb(new Error('Mismatched file extension and type.'), false);
    }
    return cb(null, true);
  }

  // Public uploads (product images, reviews) MUST be images only - NO PDFs
  if (!IMAGE_EXTENSIONS.has(ext)) {
    return cb(new Error('Invalid image extension. Only jpg, jpeg, png, and webp are allowed for media uploads.'), false);
  }
  if (!IMAGE_MIMES.has(file.mimetype)) {
    return cb(new Error('Invalid image type. Mimetype does not match allowed image types.'), false);
  }

  cb(null, true);
};

const upload = multer({ 
  storage: storage,
  fileFilter: fileFilter,
  limits: { 
    fileSize: 5 * 1024 * 1024, // 5MB limit
    files: 5
  }
});

module.exports = upload;
