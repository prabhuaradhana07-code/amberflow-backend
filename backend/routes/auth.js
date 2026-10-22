const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const pool = require('../db');
const auth = require('../middleware/auth');
const upload = require('../middleware/upload');
const { sendPasswordResetCode } = require('../utils/email');

// Email regex validator
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ──────────────────────────────────────────────────────────────
// POST /api/auth/register
// ──────────────────────────────────────────────────────────────
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, phone, address, city, state, pincode } = req.body;

    // Strict input validation
    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return res.status(400).json({ error: 'Name must be at least 2 characters long.' });
    }
    if (!email || !EMAIL_REGEX.test(email)) {
      return res.status(400).json({ error: 'A valid email address is required.' });
    }
    if (!password || typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long.' });
    }

    const cleanEmail = email.trim().toLowerCase();

    // Check if user already exists
    const userExists = await pool.query('SELECT id FROM users WHERE email = $1', [cleanEmail]);
    if (userExists.rows.length > 0) {
      return res.status(400).json({ error: 'An account with this email already exists.' });
    }

    // Hash the password with bcrypt (cost factor 10)
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Save to database
    const newUser = await pool.query(
      `INSERT INTO users (name, email, password, phone, address, city, state, pincode, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, name, email, role, phone, address, city, state, pincode, token_version`,
      [
        name.trim(),
        cleanEmail,
        hashedPassword,
        phone ? phone.trim() : null,
        address ? address.trim() : null,
        city ? city.trim() : null,
        state ? state.trim() : null,
        pincode ? pincode.trim() : null,
        req.ip
      ]
    );

    // Generate JWT Token (valid 7 days)
    const token = jwt.sign(
      { id: newUser.rows[0].id, role: newUser.rows[0].role, token_version: newUser.rows[0].token_version || 1 },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.status(201).json({ user: newUser.rows[0] });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

// ──────────────────────────────────────────────────────────────
// POST /api/auth/login
// ──────────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const cleanEmail = email.trim().toLowerCase();

    // Find user
    const user = await pool.query('SELECT * FROM users WHERE email = $1', [cleanEmail]);
    if (user.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    // Validate password
    const validPassword = await bcrypt.compare(password, user.rows[0].password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    // Generate JWT Token
    const token = jwt.sign(
      { id: user.rows[0].id, role: user.rows[0].role, token_version: user.rows[0].token_version || 1 },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({
      user: {
        id: user.rows[0].id,
        name: user.rows[0].name,
        email: user.rows[0].email,
        role: user.rows[0].role,
        phone: user.rows[0].phone,
        address: user.rows[0].address,
        city: user.rows[0].city,
        state: user.rows[0].state,
        pincode: user.rows[0].pincode,
        is_approved_vendor: user.rows[0].is_approved_vendor,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Authentication failed. Please try again.' });
  }
});

// ──────────────────────────────────────────────────────────────
// POST /api/auth/logout
// ──────────────────────────────────────────────────────────────
router.post('/logout', (req, res) => {
  res.clearCookie('token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  });
  res.json({ message: 'Logged out successfully' });
});

// ──────────────────────────────────────────────────────────────
// GET /api/auth/me
// ──────────────────────────────────────────────────────────────
router.get('/me', auth, async (req, res) => {
  try {
    const user = await pool.query(
      'SELECT id, name, email, role, phone, address, city, state, pincode, is_approved_vendor FROM users WHERE id = $1',
      [req.user.id]
    );
    if (user.rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }
    res.json({ user: user.rows[0] });
  } catch (err) {
    console.error('Auth /me error:', err);
    res.status(500).json({ error: 'Failed to retrieve profile.' });
  }
});

// ──────────────────────────────────────────────────────────────
// POST /api/auth/forgot-password
// Generates a cryptographically secure 6-digit OTP
// ──────────────────────────────────────────────────────────────
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !EMAIL_REGEX.test(email)) {
      return res.status(400).json({ error: 'Valid email is required.' });
    }

    const cleanEmail = email.trim().toLowerCase();

    // Verify user exists
    const userResult = await pool.query('SELECT id FROM users WHERE email = $1', [cleanEmail]);
    if (userResult.rows.length === 0) {
      // Generic success message prevents user enumeration
      return res.json({ message: 'If that email is registered, a reset code has been sent.' });
    }

    const userId = userResult.rows[0].id;

    // Cryptographically secure 6-digit code
    const code = crypto.randomInt(100000, 1000000).toString();

    // Expires in 15 minutes
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    // Invalidate existing unused codes
    await pool.query(
      'UPDATE password_reset_codes SET used = true WHERE user_id = $1 AND used = false',
      [userId]
    );

    // Store the secure code
    await pool.query(
      'INSERT INTO password_reset_codes (user_id, code, expires_at) VALUES ($1, $2, $3)',
      [userId, code, expiresAt]
    );

    // Send code via email
    sendPasswordResetCode(cleanEmail, code).catch(e => console.error('Forgot password email error:', e.message));

    res.json({ message: 'If that email is registered, a reset code has been sent.' });
  } catch (err) {
    console.error('Forgot-password error:', err);
    res.status(500).json({ error: 'Failed to process password reset request.' });
  }
});

// ──────────────────────────────────────────────────────────────
// POST /api/auth/reset-password
// ──────────────────────────────────────────────────────────────
router.post('/reset-password', async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;

    if (!email || !code || !newPassword) {
      return res.status(400).json({ error: 'Email, code, and newPassword are required.' });
    }

    if (typeof newPassword !== 'string' || newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters long.' });
    }

    const cleanEmail = email.trim().toLowerCase();

    // Find the user
    const userResult = await pool.query('SELECT id FROM users WHERE email = $1', [cleanEmail]);
    if (userResult.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid email or code.' });
    }

    const userId = userResult.rows[0].id;

    // Check for a valid, unused, non-expired code
    const activeCode = await pool.query(
      `SELECT id, code, attempts FROM password_reset_codes
       WHERE user_id = $1 AND used = false AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );

    if (activeCode.rows.length === 0) {
      return res.status(400).json({ error: 'No active password reset request found or code has expired.' });
    }

    const currentRecord = activeCode.rows[0];

    // Lockout check: max 5 failed attempts per OTP code to prevent brute force
    if ((currentRecord.attempts || 0) >= 5) {
      await pool.query('UPDATE password_reset_codes SET used = true WHERE id = $1', [currentRecord.id]);
      return res.status(400).json({ error: 'Too many incorrect attempts. Please request a new reset code.' });
    }

    // Verify code
    if (currentRecord.code !== code.trim()) {
      await pool.query('UPDATE password_reset_codes SET attempts = COALESCE(attempts, 0) + 1 WHERE id = $1', [currentRecord.id]);
      const remaining = 4 - (currentRecord.attempts || 0);
      return res.status(400).json({
        error: remaining > 0
          ? `Invalid code. ${remaining} attempts remaining before code is invalidated.`
          : 'Invalid code. Too many attempts. Please request a new code.'
      });
    }

    // Mark the code as used immediately
    await pool.query('UPDATE password_reset_codes SET used = true WHERE id = $1', [
      currentRecord.id,
    ]);

    // Hash the new password and update; increment token_version to revoke existing sessions
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);
    await pool.query('UPDATE users SET password = $1, token_version = COALESCE(token_version, 1) + 1 WHERE id = $2', [hashedPassword, userId]);

    res.json({ message: 'Password has been reset successfully.' });
  } catch (err) {
    console.error('Reset-password error:', err);
    res.status(500).json({ error: 'Failed to reset password.' });
  }
});

// ──────────────────────────────────────────────────────────────
// GET /api/auth/profile (protected)
// ──────────────────────────────────────────────────────────────
router.get('/profile', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, email, phone, address, city, state, pincode, role, created_at, is_approved_vendor
       FROM users WHERE id = $1`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Profile fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch profile.' });
  }
});

// ──────────────────────────────────────────────────────────────
// PUT /api/auth/profile (protected)
// ──────────────────────────────────────────────────────────────
router.put('/profile', auth, async (req, res) => {
  try {
    const { name, phone, address, city, state, pincode } = req.body;

    const result = await pool.query(
      `UPDATE users
       SET name = COALESCE($1, name),
           phone = COALESCE($2, phone),
           address = COALESCE($3, address),
           city = COALESCE($4, city),
           state = COALESCE($5, state),
           pincode = COALESCE($6, pincode)
       WHERE id = $7
       RETURNING id, name, email, phone, address, city, state, pincode, role, is_approved_vendor`,
      [
        name ? name.trim() : null,
        phone ? phone.trim() : null,
        address ? address.trim() : null,
        city ? city.trim() : null,
        state ? state.trim() : null,
        pincode ? pincode.trim() : null,
        req.user.id
      ]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Profile update error:', err);
    res.status(500).json({ error: 'Failed to update profile.' });
  }
});

// ──────────────────────────────────────────────────────────────
// PUT /api/auth/change-password (protected)
// ──────────────────────────────────────────────────────────────
router.put('/change-password', auth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required.' });
    }

    if (typeof newPassword !== 'string' || newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters long.' });
    }

    // Verify current password
    const userResult = await pool.query('SELECT password FROM users WHERE id = $1', [req.user.id]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const isMatch = await bcrypt.compare(currentPassword, userResult.rows[0].password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Current password is incorrect.' });
    }

    // Hash and update new password; increment token_version to revoke existing sessions
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);
    await pool.query('UPDATE users SET password = $1, token_version = COALESCE(token_version, 1) + 1 WHERE id = $2', [hashedPassword, req.user.id]);

    res.json({ message: 'Password changed successfully.' });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ error: 'Failed to change password. Please try again.' });
  }
});

// ──────────────────────────────────────────────────────────────
// POST /api/auth/register-vendor
// Register a new vendor and save KYC documents
// ──────────────────────────────────────────────────────────────
router.post(
  '/register-vendor',
  upload.fields([
    { name: 'aadhaar_doc', maxCount: 1 },
    { name: 'pan_doc', maxCount: 1 }
  ]),
  async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { name, email, password, phone, address, city, state, pincode, aadhaar_number, pan_number } = req.body;

      if (!name || !email || !password) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Name, email, and password are required.' });
      }

      if (!EMAIL_REGEX.test(email)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Valid email address is required.' });
      }

      if (typeof password !== 'string' || password.length < 8) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Password must be at least 8 characters long.' });
      }

      const cleanEmail = email.trim().toLowerCase();

      // Protected KYC Document URLs
      const aadhaar_doc_url = req.files && req.files.aadhaar_doc ? '/uploads/kyc/' + req.files.aadhaar_doc[0].filename : null;
      const pan_doc_url = req.files && req.files.pan_doc ? '/uploads/kyc/' + req.files.pan_doc[0].filename : null;

      const userExists = await client.query('SELECT id FROM users WHERE email = $1', [cleanEmail]);
      if (userExists.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'An account with this email already exists.' });
      }

      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);

      // Create user as vendor
      const newUser = await client.query(
        `INSERT INTO users (name, email, password, phone, address, city, state, pincode, role, ip_address)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'vendor', $9)
         RETURNING id`,
        [
          name.trim(),
          cleanEmail,
          hashedPassword,
          phone ? phone.trim() : null,
          address ? address.trim() : null,
          city ? city.trim() : null,
          state ? state.trim() : null,
          pincode ? pincode.trim() : null,
          req.ip
        ]
      );
      const userId = newUser.rows[0].id;

      // Create vendor details
      await client.query(
        `INSERT INTO vendor_details (user_id, aadhaar_number, pan_number, aadhaar_doc_url, pan_doc_url)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          userId,
          aadhaar_number ? aadhaar_number.trim() : null,
          pan_number ? pan_number.trim().toUpperCase() : null,
          aadhaar_doc_url,
          pan_doc_url
        ]
      );

      await client.query('COMMIT');
      res.status(201).json({ message: 'Vendor application submitted successfully. Awaiting admin review.' });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Vendor registration error:', err);
      res.status(500).json({ error: 'Vendor registration failed. Please try again.' });
    } finally {
      client.release();
    }
  }
);

// ──────────────────────────────────────────────────────────────
// GET /api/auth/vendors (Admin Only)
// Masks sensitive identity documents in list responses
// ──────────────────────────────────────────────────────────────
router.get('/vendors', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required.' });
    }

    const result = await pool.query(`
      SELECT u.id, u.name, u.email, u.phone, u.ip_address, u.is_approved_vendor, u.created_at,
             vd.aadhaar_number, vd.pan_number, vd.aadhaar_doc_url, vd.pan_doc_url
      FROM users u
      LEFT JOIN vendor_details vd ON u.id = vd.user_id
      WHERE u.role = 'vendor'
      ORDER BY u.created_at DESC
    `);

    // Mask sensitive documents in list view
    const sanitized = result.rows.map(v => {
      const aNum = v.aadhaar_number;
      const pNum = v.pan_number;
      return {
        ...v,
        aadhaar_number: aNum && aNum.length >= 4 ? `XXXX-XXXX-${aNum.slice(-4)}` : aNum,
        pan_number: pNum && pNum.length >= 4 ? `XXXXXX${pNum.slice(-4)}` : pNum,
      };
    });

    res.json(sanitized);
  } catch (err) {
    console.error('Vendors list error:', err);
    res.status(500).json({ error: 'Failed to fetch vendor list.' });
  }
});

// ──────────────────────────────────────────────────────────────
// GET /api/auth/users (Admin Only)
// ──────────────────────────────────────────────────────────────
router.get('/users', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required.' });
    }

    const result = await pool.query(`
      SELECT u.id, u.name, u.email, u.phone, u.city, u.state, u.created_at,
             COUNT(o.id) as total_orders,
             COALESCE(SUM(o.total), 0) as total_spent
      FROM users u
      LEFT JOIN orders o ON u.id = o.user_id
      WHERE u.role = 'customer'
      GROUP BY u.id
      ORDER BY u.created_at DESC
    `);

    res.json(result.rows);
  } catch (err) {
    console.error('Users list error:', err);
    res.status(500).json({ error: 'Failed to fetch users list.' });
  }
});

// ──────────────────────────────────────────────────────────────
// PUT /api/auth/vendors/:id/approve (Admin Only)
// ──────────────────────────────────────────────────────────────
router.put('/vendors/:id/approve', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required.' });
    }

    const vendorId = parseInt(req.params.id, 10);
    if (!vendorId || isNaN(vendorId)) {
      return res.status(400).json({ error: 'Invalid vendor ID.' });
    }

    const { is_approved_vendor } = req.body;
    await pool.query(
      'UPDATE users SET is_approved_vendor = $1 WHERE id = $2 AND role = $3',
      [Boolean(is_approved_vendor), vendorId, 'vendor']
    );

    res.json({ message: 'Vendor status updated successfully.' });
  } catch (err) {
    console.error('Vendor approval error:', err);
    res.status(500).json({ error: 'Failed to update vendor approval status.' });
  }
});

// module.exports correctly positioned at the very end of file
module.exports = router;
