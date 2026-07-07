const crypto = require('crypto');
const pool = require('../config/db');

async function listApiKeys(req, res) {
  const userId = req.user.id;
  try {
    const keysRes = await pool.query(
      `SELECT id, name, key_prefix, scope, last_used_at, created_at 
       FROM api_keys 
       WHERE user_id = $1 AND revoked_at IS NULL 
       ORDER BY created_at DESC`,
      [userId]
    );
    res.json(keysRes.rows);
  } catch (error) {
    console.error('List API keys error:', error);
    res.status(500).json({ error: 'Failed to list API keys' });
  }
}

async function generateApiKey(req, res) {
  const userId = req.user.id;
  const { name, scope } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Key name is required' });
  }

  const keyScope = scope || 'read_write';
  if (!['read_only', 'read_write'].includes(keyScope)) {
    return res.status(400).json({ error: 'Invalid permission scope' });
  }

  try {
    // Generate raw key: lpdf_ + 32 random characters
    const randomBytes = crypto.randomBytes(16).toString('hex');
    const rawKey = `lpdf_${randomBytes}`;
    
    // Hash key for DB storage
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const keyPrefix = 'lpdf_';

    await pool.query(
      `INSERT INTO api_keys (name, key_prefix, key_hash, user_id, scope) 
       VALUES ($1, $2, $3, $4, $5)`,
      [name.trim(), keyPrefix, keyHash, userId, keyScope]
    );

    // Return the raw key ONLY ONCE
    res.status(201).json({
      name: name.trim(),
      scope: keyScope,
      apiKey: rawKey,
      note: 'Make sure to copy this key now. You won’t be able to see it again!'
    });
  } catch (error) {
    console.error('Generate API key error:', error);
    res.status(500).json({ error: 'Failed to generate API key' });
  }
}

async function revokeApiKey(req, res) {
  const userId = req.user.id;
  const { id } = req.params;

  try {
    const revokeRes = await pool.query(
      `UPDATE api_keys 
       SET revoked_at = NOW() 
       WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL 
       RETURNING id`,
      [id, userId]
    );

    if (revokeRes.rows.length === 0) {
      return res.status(404).json({ error: 'API key not found or already revoked' });
    }

    res.json({ success: true, message: 'API key revoked successfully' });
  } catch (error) {
    console.error('Revoke API key error:', error);
    res.status(500).json({ error: 'Failed to revoke API key' });
  }
}

module.exports = {
  listApiKeys,
  generateApiKey,
  revokeApiKey,
};
