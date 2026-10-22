const jwt = require('jsonwebtoken');
const pool = require('../db');

module.exports = async function(req, res, next) {
  // Get token from cookie or header
  const authHeader = req.header('Authorization');
  const token = req.cookies?.token || (authHeader ? authHeader.replace('Bearer ', '') : null);

  if (!token) return res.status(401).json({ error: 'Access denied. No token provided.' });

  try {
    // Verify the token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Session revocation check: if token has token_version, check against DB
    if (decoded.token_version !== undefined) {
      const userRes = await pool.query('SELECT token_version FROM users WHERE id = $1', [decoded.id]);
      if (userRes.rows.length === 0 || (userRes.rows[0].token_version || 1) !== decoded.token_version) {
        return res.status(401).json({ error: 'Session expired or revoked. Please log in again.' });
      }
    }

    // Add user from payload
    req.user = decoded;
    next();
  } catch (ex) {
    res.status(400).json({ error: 'Invalid token.' });
  }
};
