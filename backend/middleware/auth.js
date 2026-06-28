const jwt = require('jsonwebtoken');

module.exports = function(req, res, next) {
  // Get token from cookie or header
  const authHeader = req.header('Authorization');
  const token = req.cookies.token || (authHeader ? authHeader.replace('Bearer ', '') : null);

  if (!token) return res.status(401).json({ error: 'Access denied. No token provided.' });

  try {
    // Verify the token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Add user from payload
    req.user = decoded;
    next();
  } catch (ex) {
    res.status(400).json({ error: 'Invalid token.' });
  }
};