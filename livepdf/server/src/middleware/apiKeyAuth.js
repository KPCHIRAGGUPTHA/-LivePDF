const crypto = require('crypto');
const pool = require('../config/db');

async function apiKeyAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer lpdf_')) {
    const rawKey = authHeader.split(' ')[1];
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

    try {
      const keyRes = await pool.query(
        `SELECT k.*, u.email, u.plan 
         FROM api_keys k 
         JOIN users u ON k.user_id = u.id 
         WHERE k.key_hash = $1 AND k.revoked_at IS NULL`,
        [keyHash]
      );

      if (keyRes.rows.length === 0) {
        return res.status(401).json({ error: 'Invalid or revoked API key' });
      }

      const keyData = keyRes.rows[0];
      req.user = {
        id: keyData.user_id,
        email: keyData.email,
        plan: keyData.plan || 'FREE',
        isApiKey: true,
      };

      // Set last used timestamp asynchronously
      pool.query('UPDATE api_keys SET last_used_at = NOW() WHERE id = $1', [keyData.id]).catch(console.error);
      
      return next();
    } catch (err) {
      console.error('API key lookup database error:', err);
      return res.status(500).json({ error: 'Internal API auth database exception' });
    }
  }

  next(); // fallback to standard JWT middleware downstream if no API key prefix is matched
}

module.exports = apiKeyAuth;
