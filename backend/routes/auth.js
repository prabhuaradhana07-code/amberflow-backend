const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const auth = require('../middleware/auth');
const upload = require('../middleware/upload');
const { sendPasswordResetCode } = require('../utils/email');

// ──────────────────────────────────────────────────────────────
// POST /api/auth/register
// ──────────────────────────────────────────────────────────────
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, phone, address, city, state, pincode } = req.body;

    // Check if user already exists
    const userExists = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (userExists.rows.length > 0) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Hash the password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Save to database (now includes phone, address, city, state, pincode)
    const newUser = await pool.query(
      `INSERT INTO users (name, email, password, phone, address, city, state, pincode, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, name, email, role, phone, address, city, state, pincode`,
      [name, email, hashedPassword, phone || null, address || null, city || null, state || null, pincode || null, req.ip]
    );

    // Generate JWT Token
    const token = jwt.sign(
      { id: newUser.rows[0].id, role: newUser.rows[0].role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({ user: newUser.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────────────────────
// POST /api/auth/login
// ──────────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user
    const user = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (user.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    // Validate password
    const validPassword = await bcrypt.compare(password, user.rows[0].password);
    if (!validPassword) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    // Generate JWT Token
    const token = jwt.sign(
      { id: user.rows[0].id, role: user.rows[0].role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
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
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────────────────────
// POST /api/auth/logout
// Clears the HttpOnly token cookie
// ──────────────────────────────────────────────────────────────
router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ message: 'Logged out successfully' });
});

// ──────────────────────────────────────────────────────────────
// GET /api/auth/me
// Returns the currently authenticated user based on HttpOnly cookie
// ──────────────────────────────────────────────────────────────
router.get('/me', auth, async (req, res) => {
  try {
    const user = await pool.query(
      'SELECT id, name, email, role, phone, address, city, state, pincode, is_approved_vendor FROM users WHERE id = $1',
      [req.user.id]
    );
    if (user.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ user: user.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────────────────────
// POST /api/auth/forgot-password
// Generates a 6-digit code and emails it to the user.
// ──────────────────────────────────────────────────────────────
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email is required.' });
    }

    // Verify user exists
    const userResult = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (userResult.rows.length === 0) {
      // Return success even if user not found (prevents email enumeration)
      return res.json({ message: 'If that email is registered, a reset code has been sent.' });
    }

    const userId = userResult.rows[0].id;

    // Generate a random 6-digit code
    const code = String(Math.floor(100000 + Math.random() * 900000));

    // Expires in 15 minutes
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    // Invalidate any existing unused codes for this user
    await pool.query(
      'UPDATE password_reset_codes SET used = true WHERE user_id = $1 AND used = false',
      [userId]
    );

    // Store the code
    await pool.query(
      'INSERT INTO password_reset_codes (user_id, code, expires_at) VALUES ($1, $2, $3)',
      [userId, code, expiresAt]
    );

    // Send the code via email
    sendPasswordResetCode(email, code).catch(e => console.error('Forgot password email error:', e));

    res.json({ message: 'If that email is registered, a reset code has been sent.' });
  } catch (err) {
    console.error('Forgot-password error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────────────────────
// POST /api/auth/reset-password
// Verifies the 6-digit code and sets a new password.
// ──────────────────────────────────────────────────────────────
router.post('/reset-password', async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;

    if (!email || !code || !newPassword) {
      return res.status(400).json({ error: 'Email, code, and newPassword are required.' });
    }

    // Find the user
    const userResult = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (userResult.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid email or code.' });
    }

    const userId = userResult.rows[0].id;

    // Check for a valid, unused, non-expired code
    const codeResult = await pool.query(
      `SELECT id FROM password_reset_codes
       WHERE user_id = $1 AND code = $2 AND used = false AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [userId, code]
    );

    if (codeResult.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired code.' });
    }

    // Mark the code as used
    await pool.query('UPDATE password_reset_codes SET used = true WHERE id = $1', [
      codeResult.rows[0].id,
    ]);

    // Hash the new password and update
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);
    await pool.query('UPDATE users SET password = $1 WHERE id = $2', [hashedPassword, userId]);

    res.json({ message: 'Password has been reset successfully.' });
  } catch (err) {
    console.error('Reset-password error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────────────────────
// GET /api/auth/profile  (protected)
// Returns the authenticated user's data (no password).
// ──────────────────────────────────────────────────────────────
router.get('/profile', auth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, email, role, phone, address, city, state, pincode, is_approved_vendor, created_at FROM users WHERE id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────────────────────
// PUT /api/auth/profile  (protected)
// Updates name, phone, address for the authenticated user.
// ──────────────────────────────────────────────────────────────
router.put('/profile', auth, async (req, res) => {
  try {
    const { name, phone, address, city, state, pincode } = req.body;

    const result = await pool.query(
      `UPDATE users SET
         name    = COALESCE($1, name),
         phone   = COALESCE($2, phone),
         address = COALESCE($3, address),
         city    = COALESCE($4, city),
         state   = COALESCE($5, state),
         pincode = COALESCE($6, pincode)
       WHERE id = $7
       RETURNING id, name, email, role, phone, address, city, state, pincode, created_at`,
      [name || null, phone || null, address || null, city || null, state || null, pincode || null, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

// ──────────────────────────────────────────────────────────────
// POST /api/auth/register-vendor
// Register a new vendor and save documents
// ──────────────────────────────────────────────────────────────
router.post('/register-vendor', upload.fields([{ name: 'aadhaar_doc', maxCount: 1 }, { name: 'pan_doc', maxCount: 1 }]), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { name, email, password, phone, address, city, state, pincode, aadhaar_number, pan_number } = req.body;

    // Files
    const aadhaar_doc_url = req.files && req.files.aadhaar_doc ? '/uploads/' + req.files.aadhaar_doc[0].filename : null;
    const pan_doc_url = req.files && req.files.pan_doc ? '/uploads/' + req.files.pan_doc[0].filename : null;

    const userExists = await client.query('SELECT * FROM users WHERE email = $1', [email]);
    if (userExists.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'User already exists' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create user as vendor
    const newUser = await client.query(
      `INSERT INTO users (name, email, password, phone, address, city, state, pincode, role, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'vendor', $9)
       RETURNING id`,
      [name, email, hashedPassword, phone || null, address || null, city || null, state || null, pincode || null, req.ip]
    );
    const userId = newUser.rows[0].id;

    // Create vendor details
    await client.query(
      `INSERT INTO vendor_details (user_id, aadhaar_number, pan_number, aadhaar_doc_url, pan_doc_url)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, aadhaar_number, pan_number, aadhaar_doc_url, pan_doc_url]
    );

    await client.query('COMMIT');
    res.status(201).json({ message: 'Vendor registered successfully. Awaiting admin approval.' });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ──────────────────────────────────────────────────────────────
// GET /api/auth/vendors (Admin Only)
// ──────────────────────────────────────────────────────────────
router.get('/vendors', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
    
    const result = await pool.query(`
      SELECT u.id, u.name, u.email, u.phone, u.ip_address, u.is_approved_vendor, u.created_at,
             vd.aadhaar_number, vd.pan_number, vd.aadhaar_doc_url, vd.pan_doc_url
      FROM users u
      LEFT JOIN vendor_details vd ON u.id = vd.user_id
      WHERE u.role = 'vendor'
      ORDER BY u.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────────────────────
// GET /api/auth/users (Admin Only)
// Fetch registered customers and their order activity
// ──────────────────────────────────────────────────────────────
router.get('/users', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
    
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
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────────────────────
// PUT /api/auth/vendors/:id/approve (Admin Only)
// ──────────────────────────────────────────────────────────────
router.put('/vendors/:id/approve', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
    
    const { is_approved_vendor } = req.body;
    await pool.query('UPDATE users SET is_approved_vendor = $1 WHERE id = $2 AND role = $3', [is_approved_vendor, req.params.id, 'vendor']);
    res.json({ message: 'Vendor status updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
