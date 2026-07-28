const jwt = require('jsonwebtoken');

/**
 * Optional Auth Middleware
 * Decodes JWT if present in Authorization header but does NOT block guests.
 * Sets req.user = decoded payload if valid token found, otherwise req.user = null.
 */
function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    req.user = null;
    return next();
  }

  const token = authHeader.split(' ')[1];

  try {
    const secret = process.env.JWT_SECRET || 'livepdf_production_fallback_jwt_secret_key_2026';
    const decoded = jwt.verify(token, secret);
    req.user = decoded;
  } catch (err) {
    // Token invalid or expired — treat as guest
    req.user = null;
  }

  next();
}

module.exports = optionalAuth;
