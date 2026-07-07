const jwt = require('jsonwebtoken');
const pool = require('../config/db');

/**
 * Extract client IP, taking first entry of X-Forwarded-For if behind a proxy
 * @param {object} req Express request
 * @returns {string}
 */
function getClientIp(req) {
  const xForwardedFor = req.headers['x-forwarded-for'] || req.headers['X-Forwarded-For'];
  if (xForwardedFor) {
    return xForwardedFor.split(',')[0].trim();
  }
  return req.socket.remoteAddress;
}

/**
 * Extracts userId from req if present (via authentication middleware)
 * or parses authorization header directly if not.
 * @param {object} req Express request
 * @returns {string|null}
 */
function getUserIdFromRequest(req) {
  if (req.user && req.user.id) {
    return req.user.id;
  }
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      return decoded.id;
    } catch (e) {
      // Ignore invalid token
    }
  }
  return null;
}

/**
 * Insert a log record into the audit_logs table
 * @param {object} req Express request object
 * @param {string} documentId Document ID
 * @param {string} action Action name ('view', 'download', 'upload', 'share', 'delete_link', 'delete_document')
 * @param {object} metadata Extra metadata for the action
 */
async function logAudit(req, documentId, action, metadata = {}) {
  const ipAddress = getClientIp(req);
  const userId = getUserIdFromRequest(req);
  try {
    await pool.query(
      `INSERT INTO audit_logs (document_id, user_id, action, ip_address, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [documentId, userId, action, ipAddress, JSON.stringify(metadata)]
    );
  } catch (err) {
    console.error('Failed to write to audit log:', err.message);
  }
}

module.exports = {
  getClientIp,
  getUserIdFromRequest,
  logAudit,
};
