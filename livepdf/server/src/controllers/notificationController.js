const jwt = require('jsonwebtoken');
const pool = require('../config/db');

// GET /api/notifications
async function listNotifications(req, res) {
  try {
    const result = await pool.query(
      `SELECT n.id, n.message, n.is_read, n.created_at, n.metadata, d.title AS document_title
       FROM notifications n
       LEFT JOIN documents d ON d.id = n.document_id
       WHERE n.user_id = $1
       ORDER BY n.created_at DESC
       LIMIT 50`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('List notifications error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// GET /api/notifications/count
async function getUnreadCount(req, res) {
  try {
    const result = await pool.query(
      `SELECT COUNT(*)::int AS count 
       FROM notifications 
       WHERE user_id = $1 AND is_read = FALSE`,
      [req.user.id]
    );
    res.json({ count: result.rows[0].count });
  } catch (err) {
    console.error('Get unread count error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// PATCH /api/notifications/read-all
async function readAll(req, res) {
  try {
    await pool.query(
      `UPDATE notifications 
       SET is_read = TRUE, updated_at = NOW() 
       WHERE user_id = $1 AND is_read = FALSE`,
      [req.user.id]
    );
    res.json({ message: 'All notifications marked as read' });
  } catch (err) {
    console.error('Mark all read error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// PATCH /api/notifications/:id/read
async function readIndividual(req, res) {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `UPDATE notifications 
       SET is_read = TRUE, updated_at = NOW() 
       WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [id, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    res.json({ message: 'Notification marked as read' });
  } catch (err) {
    console.error('Mark read individual error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// GET /api/notifications/preferences
async function getPreferences(req, res) {
  try {
    const result = await pool.query(
      `SELECT DISTINCT ON (d.id)
         d.id AS document_id,
         d.title,
         COALESCE(np.unsubscribed, FALSE) AS unsubscribed
       FROM audit_logs al
       JOIN documents d ON d.id = al.document_id
       LEFT JOIN notification_preferences np 
         ON np.user_id = $1 AND np.document_id = d.id
       WHERE al.user_id = $1
         AND al.action = 'view'
         AND d.owner_id != $1`,
      [req.user.id]
    );

    const preferences = result.rows.map(row => ({
      documentId: row.document_id,
      title: row.title,
      notificationsEnabled: !row.unsubscribed
    }));

    res.json(preferences);
  } catch (err) {
    console.error('Get preferences error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// PATCH /api/notifications/preferences/:documentId
async function togglePreference(req, res) {
  const { documentId } = req.params;
  const userId = req.user.id;

  try {
    const existing = await pool.query(
      'SELECT unsubscribed FROM notification_preferences WHERE user_id = $1 AND document_id = $2',
      [userId, documentId]
    );

    let nextUnsubscribed = true;
    if (existing.rows.length > 0) {
      nextUnsubscribed = !existing.rows[0].unsubscribed;
      await pool.query(
        `UPDATE notification_preferences 
         SET unsubscribed = $1, updated_at = NOW() 
         WHERE user_id = $2 AND document_id = $3`,
        [nextUnsubscribed, userId, documentId]
      );
    } else {
      await pool.query(
        `INSERT INTO notification_preferences (user_id, document_id, unsubscribed)
         VALUES ($1, $2, $3)`,
        [userId, documentId, nextUnsubscribed]
      );
    }

    res.json({ documentId, notificationsEnabled: !nextUnsubscribed });
  } catch (err) {
    console.error('Toggle preference error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// GET /api/notifications/unsubscribe (Public)
async function unsubscribe(req, res) {
  const { token } = req.query;
  if (!token) {
    return res.status(400).send('<h3>Invalid unsubscribe request: Missing token</h3>');
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { userId, documentId } = decoded;

    if (!userId || !documentId) {
      return res.status(400).send('<h3>Invalid token contents</h3>');
    }

    // Insert or update notification preference to opt-out
    await pool.query(
      `INSERT INTO notification_preferences (user_id, document_id, unsubscribed)
       VALUES ($1, $2, TRUE)
       ON CONFLICT (user_id, document_id) 
       DO UPDATE SET unsubscribed = TRUE, updated_at = NOW()`,
      [userId, documentId]
    );

    res.send(`
      <div style="font-family: sans-serif; max-width: 480px; margin: 60px auto; text-align: center; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
        <h2 style="color: #0f172a; margin-bottom: 8px;">Unsubscribed Successfully</h2>
        <p style="color: #475569; font-size: 15px; line-height: 1.5; margin-bottom: 24px;">
          You have successfully unsubscribed from receiving email updates for this document.
        </p>
        <div style="color: #94a3b8; font-size: 13px;">
          You can close this tab or manage your notification preferences inside the LivePDF dashboard.
        </div>
      </div>
    `);
  } catch (err) {
    console.error('Unsubscribe error:', err);
    res.status(400).send(`
      <div style="font-family: sans-serif; max-width: 480px; margin: 60px auto; text-align: center; padding: 24px; border: 1px solid #fee2e2; border-radius: 8px; background: #fffbeb;">
        <h2 style="color: #b91c1c; margin-bottom: 8px;">Unsubscribe Failed</h2>
        <p style="color: #92400e; font-size: 15px;">
          The link is invalid or has expired. Please verify and try again.
        </p>
      </div>
    `);
  }
}

module.exports = {
  listNotifications,
  getUnreadCount,
  readAll,
  readIndividual,
  getPreferences,
  togglePreference,
  unsubscribe,
};
