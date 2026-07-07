# LivePDF — Phase 8: Notifications, Audit & Security

## What Phase 8 adds

Phase 8 adds four major features that make LivePDF trustworthy for professional
and enterprise use:

1. **Email notifications** — viewers who recently opened a document get emailed
   when a new version is uploaded, including the AI change summary
2. **In-app notification bell** — unread count badge and dropdown panel in the
   dashboard header
3. **Audit log viewer** — document owners see every view, download, and upload
   with timestamps and IP addresses
4. **Watermarking** — viewer's identity stamped diagonally across the PDF canvas,
   controlled per share link

All email sending goes through a BullMQ job queue backed by Redis so uploads
never slow down waiting for email providers.

---

## Prerequisites

- Phases 1–7 fully working
- Phase 3's audit_logs table recording views
- Phase 7's AI summary available in version_diffs
- Redis available (local or cloud)

---

## Step 1 — Install new dependencies

```bash
cd server
npm install bullmq ioredis nodemailer uuid
# nodemailer already installed in Phase 1 — no action if present
```

```bash
cd client
npm install date-fns
# for human-readable timestamps in the notification panel
```

---

## Step 2 — Install and start Redis

### Mac

```bash
brew install redis
brew services start redis
# Redis runs on localhost:6379 by default
```

### Ubuntu / Debian

```bash
sudo apt install redis-server
sudo systemctl enable redis-server
sudo systemctl start redis-server
```

### Verify Redis is running

```bash
redis-cli ping
# Should respond: PONG
```

### Cloud option (Upstash — free tier)

1. Go to https://upstash.com and create a free Redis database
2. Copy the `REDIS_URL` from the dashboard (looks like `redis://default:password@host:port`)
3. Use this URL in your `.env` instead of `redis://localhost:6379`

---

## Step 3 — Environment variables

Add to `server/.env`:

```env
# Redis (BullMQ backend)
REDIS_URL=redis://localhost:6379

# Notification settings
NOTIFICATION_LOOKBACK_DAYS=7      # how far back to look in audit_logs for viewers
MAX_EMAILS_PER_JOB=50             # cap recipients per job to avoid rate limits
EMAIL_FROM_NAME=LivePDF
EMAIL_FROM_ADDRESS=notifications@yourdomain.com

# Watermark
WATERMARK_OPACITY=0.07            # 0.0 to 1.0 — keep low so content is readable
WATERMARK_ANGLE=-30               # degrees — negative = tilt left
```

---

## Step 4 — New database tables

Create `server/migrations/phase8.sql`:

```sql
-- ─────────────────────────────────────────────────────────────
-- NOTIFICATION PREFERENCES
-- Stores per-user per-document opt-out preferences
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notification_preferences (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  document_id   UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  notify        BOOLEAN DEFAULT TRUE,
  unsubscribe_token VARCHAR(128) UNIQUE,  -- signed token for email unsubscribe link
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, document_id)
);

CREATE INDEX IF NOT EXISTS idx_notif_prefs_user ON notification_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_notif_prefs_doc  ON notification_preferences(document_id);

-- ─────────────────────────────────────────────────────────────
-- Add show_watermark column to share_links (from Phase 3)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE share_links
  ADD COLUMN IF NOT EXISTS show_watermark BOOLEAN DEFAULT FALSE;

-- ─────────────────────────────────────────────────────────────
-- Add download_count to versions for analytics
-- ─────────────────────────────────────────────────────────────
ALTER TABLE versions
  ADD COLUMN IF NOT EXISTS download_count INTEGER DEFAULT 0;
```

Run it:

```bash
psql -U postgres -d livepdf -f server/migrations/phase8.sql
```

---

## Step 5 — New files to create

### Backend

```
server/
├── worker.js                        ← BullMQ worker process (run separately)
└── src/
    ├── queues/
    │   └── emailQueue.js            ← queue definition + job adder
    ├── services/
    │   └── notificationService.js   ← find recipients, build email, enqueue
    ├── utils/
    │   ├── ipExtractor.js           ← get real client IP behind proxies
    │   └── emailTemplates.js        ← HTML email templates
    ├── controllers/
    │   └── notificationController.js ← list, count, mark read, preferences
    └── routes/
        └── notifications.js         ← notification API routes
```

### Frontend

```
client/src/
├── components/
│   ├── NotificationBell.jsx         ← bell icon with badge + dropdown
│   ├── NotificationItem.jsx         ← single notification row
│   ├── AuditLogPanel.jsx            ← audit trail for document owners
│   └── WatermarkOverlay.jsx         ← diagonal canvas watermark
└── hooks/
    └── useNotifications.js          ← polling hook for notification count
```

### Updated files

```
server/src/
├── controllers/
│   ├── documentController.js        ← UPDATED: log uploads, enqueue email job
│   └── shareController.js          ← UPDATED: log views/downloads, show_watermark
└── routes/
    └── share.js                     ← UPDATED: add show_watermark to create params

client/src/
├── components/
│   ├── PdfViewer.jsx                ← UPDATED: add WatermarkOverlay
│   └── ShareModal.jsx               ← UPDATED: add watermark toggle
└── pages/
    └── Dashboard.jsx                ← UPDATED: add NotificationBell in header
```

---

## Step 6 — Backend code walkthrough

### emailQueue.js — queue definition

```js
const { Queue } = require('bullmq');
const { Redis } = require('ioredis');

const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,  // required by BullMQ
});

const emailQueue = new Queue('email-notifications', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 30000,  // start at 30 seconds, then 60s, 120s
    },
    removeOnComplete: { count: 100 },  // keep last 100 completed jobs
    removeOnFail: { count: 50 },       // keep last 50 failed jobs for inspection
  },
});

async function enqueueNotificationEmail(payload) {
  await emailQueue.add('send-notification', payload, {
    priority: 1,
  });
}

module.exports = { emailQueue, enqueueNotificationEmail };
```

---

### notificationService.js — find recipients and build jobs

```js
const pool = require('../config/db');
const jwt = require('jsonwebtoken');
const { enqueueNotificationEmail } = require('../queues/emailQueue');

const LOOKBACK_DAYS = parseInt(process.env.NOTIFICATION_LOOKBACK_DAYS) || 7;

async function getNotificationRecipients(documentId, excludeUserId) {
  /**
   * Returns users who:
   * 1. Viewed the document in the last N days (from audit_logs)
   * 2. Are logged-in users (user_id not null)
   * 3. Have not opted out of notifications for this document
   * 4. Are not the document owner
   */
  const result = await pool.query(
    `SELECT DISTINCT u.id, u.email, u.full_name
     FROM audit_logs al
     JOIN users u ON u.id = al.user_id
     WHERE al.document_id = $1
       AND al.action = 'view'
       AND al.created_at > NOW() - INTERVAL '${LOOKBACK_DAYS} days'
       AND al.user_id IS NOT NULL
       AND al.user_id != $2
       AND NOT EXISTS (
         SELECT 1 FROM notification_preferences np
         WHERE np.user_id = al.user_id
           AND np.document_id = al.document_id
           AND np.notify = FALSE
       )`,
    [documentId, excludeUserId]
  );

  return result.rows;
}

function generateUnsubscribeToken(userId, documentId) {
  // Signed, never-expiring token for the unsubscribe link
  return jwt.sign(
    { userId, documentId, purpose: 'unsubscribe' },
    process.env.JWT_SECRET
  );
}

async function scheduleVersionNotifications({
  documentId,
  documentTitle,
  versionNumber,
  ownerId,
  shareToken,
  aiSummary,
}) {
  const recipients = await getNotificationRecipients(documentId, ownerId);

  if (recipients.length === 0) return;

  // Insert notification rows into notifications table
  for (const recipient of recipients) {
    await pool.query(
      `INSERT INTO notifications (user_id, document_id, message)
       VALUES ($1, $2, $3)`,
      [
        recipient.id,
        documentId,
        `"${documentTitle}" was updated to version ${versionNumber}`,
      ]
    );
  }

  // Cap recipients to avoid rate limit issues
  const MAX = parseInt(process.env.MAX_EMAILS_PER_JOB) || 50;
  const batch = recipients.slice(0, MAX);

  for (const recipient of batch) {
    const unsubToken = generateUnsubscribeToken(recipient.id, documentId);

    // Upsert unsubscribe token into preferences table
    await pool.query(
      `INSERT INTO notification_preferences (user_id, document_id, unsubscribe_token)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, document_id)
       DO UPDATE SET unsubscribe_token = EXCLUDED.unsubscribe_token`,
      [recipient.id, documentId, unsubToken]
    );

    await enqueueNotificationEmail({
      to: recipient.email,
      toName: recipient.full_name,
      documentTitle,
      versionNumber,
      shareUrl: `${process.env.CLIENT_URL}/view/${shareToken}`,
      aiSummary,
      unsubscribeToken: unsubToken,
    });
  }

  console.log(`Scheduled ${batch.length} notification emails for doc ${documentId}`);
}

module.exports = { scheduleVersionNotifications };
```

---

### emailTemplates.js — HTML notification email

```js
function versionUpdateEmail({
  toName, documentTitle, versionNumber, shareUrl, aiSummary, unsubscribeUrl,
}) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f9f9f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:40px 16px">
      <table width="560" cellpadding="0" cellspacing="0"
             style="background:#fff;border-radius:12px;border:0.5px solid #e0e0e0;overflow:hidden">

        <!-- Header -->
        <tr>
          <td style="padding:28px 32px 20px;border-bottom:0.5px solid #f0f0f0">
            <span style="font-size:20px;font-weight:600;color:#1a1a1a">LivePDF</span>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:28px 32px">
            <p style="margin:0 0 6px;font-size:15px;color:#555">Hi ${toName},</p>
            <h2 style="margin:0 0 20px;font-size:20px;font-weight:500;color:#1a1a1a;line-height:1.4">
              <strong>"${documentTitle}"</strong> was updated to version ${versionNumber}
            </h2>

            ${aiSummary ? `
            <div style="background:#f5f5f3;border-radius:8px;padding:16px 20px;margin-bottom:24px">
              <p style="margin:0 0 6px;font-size:11px;font-weight:600;color:#888;
                         text-transform:uppercase;letter-spacing:0.5px">
                ✦ What changed
              </p>
              <p style="margin:0;font-size:14px;color:#333;line-height:1.7">${aiSummary}</p>
            </div>` : ''}

            <a href="${shareUrl}"
               style="display:inline-block;background:#1a1a1a;color:#fff;
                      text-decoration:none;padding:12px 24px;border-radius:8px;
                      font-size:14px;font-weight:500">
              View latest version →
            </a>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:16px 32px 24px;border-top:0.5px solid #f0f0f0">
            <p style="margin:0;font-size:12px;color:#bbb;line-height:1.6">
              You received this because you viewed this document recently.
              <a href="${unsubscribeUrl}" style="color:#bbb">Unsubscribe</a>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

module.exports = { versionUpdateEmail };
```

---

### worker.js — BullMQ worker process (run separately)

```js
require('dotenv').config();
const { Worker } = require('bullmq');
const { Redis } = require('ioredis');
const nodemailer = require('nodemailer');
const { versionUpdateEmail } = require('./src/utils/emailTemplates');

const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: parseInt(process.env.EMAIL_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const worker = new Worker(
  'email-notifications',
  async (job) => {
    const {
      to, toName, documentTitle, versionNumber,
      shareUrl, aiSummary, unsubscribeToken,
    } = job.data;

    const unsubscribeUrl =
      `${process.env.SERVER_URL}/api/notifications/unsubscribe/${unsubscribeToken}`;

    const html = versionUpdateEmail({
      toName, documentTitle, versionNumber,
      shareUrl, aiSummary, unsubscribeUrl,
    });

    await transporter.sendMail({
      from: `"${process.env.EMAIL_FROM_NAME || 'LivePDF'}" <${process.env.EMAIL_FROM_ADDRESS || process.env.EMAIL_USER}>`,
      to,
      subject: `"${documentTitle}" was updated to version ${versionNumber}`,
      html,
    });

    console.log(`Email sent to ${to} for doc version ${versionNumber}`);
  },
  {
    connection,
    concurrency: 5,  // process up to 5 emails simultaneously
  }
);

worker.on('completed', job => {
  console.log(`Job ${job.id} completed`);
});

worker.on('failed', (job, err) => {
  console.error(`Job ${job.id} failed:`, err.message);
});

console.log('BullMQ email worker started');
```

---

### ipExtractor.js — real client IP behind proxies

```js
function getClientIp(req) {
  // X-Forwarded-For can be a comma-separated chain of IPs
  // First IP is the original client, rest are proxies
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || req.ip || 'unknown';
}

module.exports = { getClientIp };
```

---

### notificationController.js — notification API handlers

```js
const pool = require('../config/db');
const jwt = require('jsonwebtoken');

// GET /api/notifications — list all notifications for logged-in user
async function listNotifications(req, res) {
  const result = await pool.query(
    `SELECT n.id, n.message, n.is_read, n.created_at,
            d.title AS document_title, d.id AS document_id
     FROM notifications n
     JOIN documents d ON d.id = n.document_id
     WHERE n.user_id = $1
     ORDER BY n.created_at DESC
     LIMIT 50`,
    [req.user.id]
  );
  res.json(result.rows);
}

// GET /api/notifications/count — unread count for badge
async function getUnreadCount(req, res) {
  const result = await pool.query(
    'SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND is_read = FALSE',
    [req.user.id]
  );
  res.json({ count: parseInt(result.rows[0].count) });
}

// PATCH /api/notifications/read-all — mark all as read
async function markAllRead(req, res) {
  await pool.query(
    `UPDATE notifications
     SET is_read = TRUE, updated_at = NOW()
     WHERE user_id = $1 AND is_read = FALSE`,
    [req.user.id]
  );
  res.json({ message: 'All notifications marked as read' });
}

// PATCH /api/notifications/:id/read — mark one as read
async function markOneRead(req, res) {
  await pool.query(
    'UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2',
    [req.params.id, req.user.id]
  );
  res.json({ message: 'Notification marked as read' });
}

// GET /api/notifications/unsubscribe/:token — email unsubscribe link
async function unsubscribe(req, res) {
  try {
    const decoded = jwt.verify(req.params.token, process.env.JWT_SECRET);

    if (decoded.purpose !== 'unsubscribe') {
      return res.status(400).send('Invalid unsubscribe link');
    }

    await pool.query(
      `INSERT INTO notification_preferences (user_id, document_id, notify)
       VALUES ($1, $2, FALSE)
       ON CONFLICT (user_id, document_id)
       DO UPDATE SET notify = FALSE, updated_at = NOW()`,
      [decoded.userId, decoded.documentId]
    );

    // Return a plain confirmation page
    res.send(`
      <html><body style="font-family:sans-serif;text-align:center;padding:60px">
        <h2>Unsubscribed</h2>
        <p>You will no longer receive notifications for this document.</p>
      </body></html>
    `);
  } catch {
    res.status(400).send('Invalid or expired unsubscribe link');
  }
}

// GET /api/notifications/preferences — list all doc subscriptions for user
async function getPreferences(req, res) {
  const result = await pool.query(
    `SELECT np.document_id, np.notify, d.title
     FROM notification_preferences np
     JOIN documents d ON d.id = np.document_id
     WHERE np.user_id = $1
     ORDER BY d.title`,
    [req.user.id]
  );
  res.json(result.rows);
}

// PATCH /api/notifications/preferences/:documentId — toggle preference
async function updatePreference(req, res) {
  const { notify } = req.body;

  await pool.query(
    `INSERT INTO notification_preferences (user_id, document_id, notify)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, document_id)
     DO UPDATE SET notify = EXCLUDED.notify, updated_at = NOW()`,
    [req.user.id, req.params.documentId, notify]
  );

  res.json({ message: 'Preference updated' });
}

// GET /api/documents/:id/audit — audit log for document owner
async function getAuditLog(req, res) {
  // Verify ownership first
  const doc = await pool.query(
    'SELECT id FROM documents WHERE id = $1 AND owner_id = $2',
    [req.params.id, req.user.id]
  );
  if (doc.rows.length === 0) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const { action, limit = 100, offset = 0 } = req.query;

  const whereClause = action
    ? `AND al.action = $3`
    : '';
  const params = action
    ? [req.params.id, parseInt(limit), action, parseInt(offset)]
    : [req.params.id, parseInt(limit), parseInt(offset)];

  const result = await pool.query(
    `SELECT
       al.id, al.action, al.ip_address, al.created_at,
       al.metadata,
       u.full_name AS user_name,
       u.email AS user_email
     FROM audit_logs al
     LEFT JOIN users u ON u.id = al.user_id
     WHERE al.document_id = $1
     ${whereClause}
     ORDER BY al.created_at DESC
     LIMIT $2
     OFFSET ${action ? '$4' : '$3'}`,
    params
  );

  res.json({
    logs: result.rows.map(row => ({
      ...row,
      user_name: row.user_name || 'Anonymous',
      user_email: row.user_email || null,
    })),
    total: result.rows.length,
  });
}

module.exports = {
  listNotifications, getUnreadCount, markAllRead, markOneRead,
  unsubscribe, getPreferences, updatePreference, getAuditLog,
};
```

---

### notifications.js — routes

```js
const router = require('express').Router();
const auth = require('../middleware/auth');
const ctrl = require('../controllers/notificationController');

router.get('/',                              auth, ctrl.listNotifications);
router.get('/count',                         auth, ctrl.getUnreadCount);
router.patch('/read-all',                    auth, ctrl.markAllRead);
router.patch('/:id/read',                    auth, ctrl.markOneRead);
router.get('/unsubscribe/:token',                  ctrl.unsubscribe);   // no auth — email link
router.get('/preferences',                   auth, ctrl.getPreferences);
router.patch('/preferences/:documentId',     auth, ctrl.updatePreference);

module.exports = router;
```

Register in `index.js`:

```js
const notificationRoutes = require('./routes/notifications');
app.use('/api/notifications', notificationRoutes);
```

Also add the audit log route to `documents.js`:

```js
router.get('/:id/audit', auth, ctrl.getAuditLog);
```

---

### Updated documentController.js — log upload, enqueue emails

After saving the new version and emitting the Socket.IO event, add:

```js
const { getClientIp } = require('../utils/ipExtractor');
const { scheduleVersionNotifications } = require('../services/notificationService');

// Log the upload action
await pool.query(
  `INSERT INTO audit_logs (document_id, user_id, action, ip_address, metadata)
   VALUES ($1, $2, 'upload', $3, $4)`,
  [
    documentId,
    req.user.id,
    getClientIp(req),
    JSON.stringify({ versionNumber: newVersionNumber }),
  ]
);

// Fetch an existing public share link token for the notification email
const shareResult = await pool.query(
  `SELECT token FROM share_links
   WHERE document_id = $1 AND link_type = 'public'
   ORDER BY created_at DESC LIMIT 1`,
  [documentId]
);
const shareToken = shareResult.rows[0]?.token || null;

// Fetch AI summary if already computed
const summaryResult = await pool.query(
  `SELECT ai.summary_text
   FROM ai_summaries ai
   JOIN version_diffs vd ON vd.id = ai.version_diff_id
   WHERE vd.document_id = $1
   ORDER BY vd.computed_at DESC LIMIT 1`,
  [documentId]
);
const aiSummary = summaryResult.rows[0]?.summary_text || null;

// Enqueue notification emails (non-blocking)
if (shareToken) {
  scheduleVersionNotifications({
    documentId,
    documentTitle: document.title,
    versionNumber: newVersionNumber,
    ownerId: req.user.id,
    shareToken,
    aiSummary,
  }).catch(console.error);
}
```

---

### Updated shareController.js — log views with IP + show_watermark

In `resolveToken`, update the audit log insert and the response:

```js
const { getClientIp } = require('../utils/ipExtractor');

// Replace the existing audit_logs insert with:
await pool.query(
  `INSERT INTO audit_logs (document_id, user_id, action, ip_address, metadata)
   VALUES ($1, $2, 'view', $3, $4)`,
  [
    link.document_id,
    req.user?.id || null,
    getClientIp(req),
    JSON.stringify({ token, linkType: link.link_type }),
  ]
);

// Add show_watermark to the response:
res.json({
  signedUrl,
  title: link.title,
  allowDownload: link.allow_download,
  documentId: link.document_id,
  versionNumber: currentVersion.version_number,
  showWatermark: link.show_watermark,     // ← ADD THIS
  viewerEmail: req.user?.email || null,   // ← ADD THIS (for watermark text)
});
```

For downloads, log in `getSignedUrl` controller:

```js
await pool.query(
  `INSERT INTO audit_logs (document_id, user_id, action, ip_address, metadata)
   VALUES ($1, $2, 'download', $3, $4)`,
  [documentId, req.user?.id || null, getClientIp(req), JSON.stringify({ token })]
);

// Also increment download count
await pool.query(
  'UPDATE versions SET download_count = download_count + 1 WHERE id = $1',
  [currentVersionId]
);
```

---

## Step 7 — Frontend code walkthrough

### useNotifications.js — polling hook

```js
import { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';

export default function useNotifications() {
  const [count, setCount] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [open, setOpen] = useState(false);

  const fetchCount = useCallback(async () => {
    try {
      const res = await api.get('/notifications/count');
      setCount(res.data.count);
    } catch {
      // Silent fail — don't break the UI for a failed count fetch
    }
  }, []);

  // Poll every 30 seconds
  useEffect(() => {
    fetchCount();
    const interval = setInterval(fetchCount, 30000);
    return () => clearInterval(interval);
  }, [fetchCount]);

  const openPanel = useCallback(async () => {
    setOpen(true);
    try {
      const res = await api.get('/notifications');
      setNotifications(res.data);
      // Mark all as read when panel opens
      if (count > 0) {
        await api.patch('/notifications/read-all');
        setCount(0);
      }
    } catch {
      // Silent fail
    }
  }, [count]);

  const closePanel = useCallback(() => setOpen(false), []);

  return { count, notifications, open, openPanel, closePanel };
}
```

---

### NotificationBell.jsx — bell icon with dropdown

```jsx
import { useRef, useEffect } from 'react';
import { formatDistanceToNow } from 'date-fns';
import useNotifications from '../hooks/useNotifications';
import NotificationItem from './NotificationItem';

export default function NotificationBell() {
  const { count, notifications, open, openPanel, closePanel } = useNotifications();
  const panelRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    function handleClick(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        closePanel();
      }
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open, closePanel]);

  return (
    <div style={styles.wrap} ref={panelRef}>
      <button style={styles.bell} onClick={open ? closePanel : openPanel}>
        🔔
        {count > 0 && (
          <span style={styles.badge}>{count > 99 ? '99+' : count}</span>
        )}
      </button>

      {open && (
        <div style={styles.panel}>
          <div style={styles.panelHeader}>
            <span style={styles.panelTitle}>Notifications</span>
          </div>

          {notifications.length === 0 ? (
            <p style={styles.empty}>No notifications yet</p>
          ) : (
            <ul style={styles.list}>
              {notifications.map(n => (
                <NotificationItem key={n.id} notification={n} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

const styles = {
  wrap: { position: 'relative' },
  bell: { position: 'relative', background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', padding: '4px 6px' },
  badge: { position: 'absolute', top: -2, right: -2, background: '#ef4444', color: '#fff', fontSize: 10, fontWeight: 600, borderRadius: 10, padding: '1px 5px', minWidth: 16, textAlign: 'center' },
  panel: { position: 'absolute', top: '100%', right: 0, marginTop: 8, width: 340, background: '#fff', border: '0.5px solid #e0e0e0', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.1)', zIndex: 200, overflow: 'hidden' },
  panelHeader: { padding: '12px 16px', borderBottom: '0.5px solid #f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  panelTitle: { fontSize: 13, fontWeight: 500, color: '#1a1a1a' },
  list: { listStyle: 'none', maxHeight: 380, overflow: 'auto' },
  empty: { padding: '2rem', textAlign: 'center', fontSize: 13, color: '#aaa' },
};
```

---

### NotificationItem.jsx

```jsx
import { formatDistanceToNow } from 'date-fns';
import { useNavigate } from 'react-router-dom';

export default function NotificationItem({ notification }) {
  const navigate = useNavigate();

  return (
    <li
      style={{
        ...styles.item,
        background: notification.is_read ? '#fff' : '#fafaf8',
      }}
      onClick={() => navigate(`/dashboard`)}
    >
      <div style={styles.dot}>
        {!notification.is_read && <div style={styles.unreadDot} />}
      </div>
      <div style={styles.content}>
        <p style={styles.message}>{notification.message}</p>
        <span style={styles.time}>
          {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
        </span>
      </div>
    </li>
  );
}

const styles = {
  item: { display: 'flex', gap: 10, padding: '12px 16px', cursor: 'pointer', borderBottom: '0.5px solid #f5f5f5' },
  dot: { width: 8, flexShrink: 0, paddingTop: 5 },
  unreadDot: { width: 7, height: 7, borderRadius: '50%', background: '#3b82f6' },
  content: { flex: 1 },
  message: { fontSize: 13, color: '#1a1a1a', lineHeight: 1.4, margin: '0 0 3px' },
  time: { fontSize: 11, color: '#aaa' },
};
```

---

### AuditLogPanel.jsx — audit trail for document owners

```jsx
import { useState, useEffect } from 'react';
import { formatDistanceToNow } from 'date-fns';
import api from '../utils/api';

const ACTION_LABELS = {
  view: { label: 'Viewed', color: '#3b82f6' },
  download: { label: 'Downloaded', color: '#8b5cf6' },
  upload: { label: 'Uploaded new version', color: '#22c55e' },
  share: { label: 'Share link created', color: '#f59e0b' },
  delete_link: { label: 'Share link deleted', color: '#ef4444' },
};

export default function AuditLogPanel({ documentId, onClose }) {
  const [logs, setLogs] = useState([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchLogs() {
      setLoading(true);
      try {
        const params = filter !== 'all' ? `?action=${filter}` : '';
        const res = await api.get(`/documents/${documentId}/audit${params}`);
        setLogs(res.data.logs);
      } catch {
        setLogs([]);
      } finally {
        setLoading(false);
      }
    }
    fetchLogs();
  }, [documentId, filter]);

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.panel} onClick={e => e.stopPropagation()}>
        <div style={styles.header}>
          <span style={styles.title}>Audit Log</span>
          <button style={styles.close} onClick={onClose}>✕</button>
        </div>

        <div style={styles.filters}>
          {['all', 'view', 'download', 'upload', 'share'].map(f => (
            <button
              key={f}
              style={{ ...styles.filterBtn, ...(filter === f ? styles.activeFilter : {}) }}
              onClick={() => setFilter(f)}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        {loading ? (
          <p style={styles.empty}>Loading…</p>
        ) : logs.length === 0 ? (
          <p style={styles.empty}>No activity recorded yet.</p>
        ) : (
          <ul style={styles.list}>
            {logs.map(log => {
              const actionInfo = ACTION_LABELS[log.action] || { label: log.action, color: '#888' };
              return (
                <li key={log.id} style={styles.row}>
                  <div style={{ ...styles.actionDot, background: actionInfo.color }} />
                  <div style={styles.rowContent}>
                    <div style={styles.rowTop}>
                      <span style={{ ...styles.actionLabel, color: actionInfo.color }}>
                        {actionInfo.label}
                      </span>
                      <span style={styles.rowTime}>
                        {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                      </span>
                    </div>
                    <p style={styles.rowMeta}>
                      {log.user_name}
                      {log.ip_address && ` · ${log.ip_address}`}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

const styles = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  panel: { background: '#fff', borderRadius: 12, width: 520, maxHeight: '80vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  header: { padding: '16px 20px', borderBottom: '0.5px solid #f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 15, fontWeight: 500 },
  close: { background: 'none', border: 'none', fontSize: 16, cursor: 'pointer', color: '#aaa' },
  filters: { padding: '10px 20px', display: 'flex', gap: 6, borderBottom: '0.5px solid #f0f0f0', flexWrap: 'wrap' },
  filterBtn: { padding: '5px 12px', borderRadius: 20, border: '0.5px solid #e0e0e0', background: '#fff', fontSize: 12, cursor: 'pointer', color: '#666' },
  activeFilter: { background: '#1a1a1a', color: '#fff', borderColor: '#1a1a1a' },
  list: { listStyle: 'none', overflow: 'auto', flex: 1, padding: '8px 0' },
  row: { display: 'flex', gap: 12, padding: '10px 20px', borderBottom: '0.5px solid #f8f8f8', alignItems: 'flex-start' },
  actionDot: { width: 8, height: 8, borderRadius: '50%', marginTop: 5, flexShrink: 0 },
  rowContent: { flex: 1 },
  rowTop: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  actionLabel: { fontSize: 13, fontWeight: 500 },
  rowTime: { fontSize: 11, color: '#aaa' },
  rowMeta: { fontSize: 12, color: '#888', margin: 0 },
  empty: { padding: '3rem', textAlign: 'center', color: '#aaa', fontSize: 13 },
};
```

---

### WatermarkOverlay.jsx — diagonal canvas watermark

```jsx
import { useEffect, useRef } from 'react';

export default function WatermarkOverlay({ viewerEmail, width, height }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !width || !height) return;

    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, width, height);

    const text = viewerEmail || 'Shared via LivePDF';
    const opacity = parseFloat(
      getComputedStyle(document.documentElement)
        .getPropertyValue('--watermark-opacity') || '0.07'
    );

    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.fillStyle = '#000000';
    ctx.font = `${Math.max(12, width * 0.025)}px sans-serif`;
    ctx.textAlign = 'center';

    // Rotate around the center
    ctx.translate(width / 2, height / 2);
    ctx.rotate(-30 * Math.PI / 180);

    const stepX = width * 0.45;
    const stepY = height * 0.18;
    const cols = Math.ceil(width / stepX) + 2;
    const rows = Math.ceil(height / stepY) + 4;

    for (let row = -rows; row <= rows; row++) {
      for (let col = -cols; col <= cols; col++) {
        ctx.fillText(text, col * stepX, row * stepY);
      }
    }

    ctx.restore();
  }, [viewerEmail, width, height]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 5,
      }}
    />
  );
}
```

---

### Updated PdfViewer.jsx — add watermark

```jsx
import WatermarkOverlay from './WatermarkOverlay';

// Add props
export default function PdfViewer({ url, title, allowDownload, socket,
                                    showWatermark, viewerEmail }) {
  // Track rendered page dimensions for the watermark canvas
  const [pageDimensions, setPageDimensions] = useState({ width: 0, height: 0 });

  // In the Page component's onRenderSuccess:
  // onRenderSuccess={(page) => {
  //   setPageDimensions({ width: page.width, height: page.height });
  //   setPageHeight(page.height / scale);
  // }}

  // Inside the relative container wrapping Document + DiffOverlay, add:
  // {showWatermark && (
  //   <WatermarkOverlay
  //     viewerEmail={viewerEmail}
  //     width={pageDimensions.width}
  //     height={pageDimensions.height}
  //   />
  // )}
}
```

---

### Updated Viewer.jsx — pass watermark props

```jsx
// From the resolver response, capture:
const [showWatermark, setShowWatermark] = useState(false);
const [viewerEmail, setViewerEmail] = useState(null);

// In resolve():
setShowWatermark(res.data.showWatermark);
setViewerEmail(res.data.viewerEmail);

// Pass to PdfViewer:
<PdfViewer
  url={pdfUrl}
  title={title}
  allowDownload={allowDownload}
  socket={socket}
  showWatermark={showWatermark}
  viewerEmail={viewerEmail}
/>
```

---

### Updated ShareModal.jsx — watermark toggle

Add to the share link creation form (all three tabs):

```jsx
<div style={styles.toggleRow}>
  <label style={styles.toggleLabel}>
    <input
      type="checkbox"
      checked={showWatermark}
      onChange={e => setShowWatermark(e.target.checked)}
    />
    <span style={{ marginLeft: 8 }}>Show watermark (stamps viewer's email on PDF)</span>
  </label>
</div>
```

Pass `showWatermark` in the POST body to `/api/share/documents/:id/share`.

Update `shareController.js` `createShareLink` to read and store it:

```js
const { showWatermark = false } = req.body;
// Add $8 to the INSERT values list with showWatermark
```

---

## How to run all services in Phase 8

```bash
# Terminal 1 — Node.js API server
cd server && npm run dev

# Terminal 2 — BullMQ email worker
cd server && node worker.js

# Terminal 3 — Python diff engine (from Phase 6)
cd python && source venv/bin/activate && uvicorn main:app --port 8001 --reload

# Terminal 4 — React frontend
cd client && npm run dev
```

---

## API endpoints (Phase 8)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | /api/notifications | ✅ JWT | List all notifications |
| GET | /api/notifications/count | ✅ JWT | Unread count for badge |
| PATCH | /api/notifications/read-all | ✅ JWT | Mark all as read |
| PATCH | /api/notifications/:id/read | ✅ JWT | Mark one as read |
| GET | /api/notifications/unsubscribe/:token | ❌ | Email unsubscribe link |
| GET | /api/notifications/preferences | ✅ JWT | List document subscriptions |
| PATCH | /api/notifications/preferences/:docId | ✅ JWT | Toggle notification for doc |
| GET | /api/documents/:id/audit | ✅ JWT | Audit log (owner only) |

---

## Complete file structure after Phase 8

```
livepdf/
├── python/                              (unchanged)
│
├── server/
│   ├── worker.js                        ← NEW (run separately)
│   └── src/
│       ├── index.js                     ← UPDATED (register /api/notifications)
│       ├── socket.js
│       ├── queues/
│       │   └── emailQueue.js            ← NEW
│       ├── services/
│       │   ├── diffService.js
│       │   ├── aiService.js
│       │   ├── embeddingService.js
│       │   ├── qaService.js
│       │   └── notificationService.js   ← NEW
│       ├── utils/
│       │   ├── email.js
│       │   ├── emailTemplates.js        ← NEW
│       │   └── ipExtractor.js           ← NEW
│       ├── controllers/
│       │   ├── authController.js
│       │   ├── documentController.js    ← UPDATED (log upload, enqueue email)
│       │   ├── shareController.js       ← UPDATED (log view/download, watermark)
│       │   └── notificationController.js ← NEW
│       └── routes/
│           ├── auth.js
│           ├── documents.js             ← UPDATED (add /audit)
│           ├── share.js                 ← UPDATED (show_watermark param)
│           ├── qa.js
│           └── notifications.js         ← NEW
│
└── client/
    └── src/
        ├── hooks/
        │   ├── usePdfSearch.js
        │   ├── useSocket.js
        │   ├── useSignedUrlRefresh.js
        │   ├── useDiff.js
        │   ├── useChat.js
        │   └── useNotifications.js      ← NEW
        ├── components/
        │   ├── PdfViewer.jsx            ← UPDATED (WatermarkOverlay)
        │   ├── PdfToolbar.jsx
        │   ├── SearchBar.jsx
        │   ├── PreviewModal.jsx
        │   ├── ConnectionStatus.jsx
        │   ├── ViewerToast.jsx
        │   ├── DiffOverlay.jsx
        │   ├── DiffTooltip.jsx
        │   ├── DiffPanel.jsx
        │   ├── ChangeBadge.jsx
        │   ├── AiSummaryCard.jsx
        │   ├── ChatPanel.jsx
        │   ├── ChatMessage.jsx
        │   ├── StreamingText.jsx
        │   ├── ShareModal.jsx           ← UPDATED (watermark toggle)
        │   ├── NotificationBell.jsx     ← NEW
        │   ├── NotificationItem.jsx     ← NEW
        │   ├── AuditLogPanel.jsx        ← NEW
        │   └── WatermarkOverlay.jsx     ← NEW
        └── pages/
            ├── Dashboard.jsx            ← UPDATED (NotificationBell in header)
            └── Viewer.jsx               ← UPDATED (showWatermark, viewerEmail)
```

---

## How to test Phase 8

### Test email notifications

1. Create two user accounts — Owner and Viewer
2. Owner uploads a document and creates a public share link
3. Log in as Viewer and open the share link
4. Log back in as Owner and upload a new version
5. Check Viewer's email inbox — notification email should arrive within seconds
6. Email should contain the document title, version number, and AI summary
7. Click the "View latest version →" button — should open the correct share link

### Test unsubscribe

1. Click the Unsubscribe link at the bottom of the notification email
2. Browser opens the unsubscribe confirmation page
3. Owner uploads another new version
4. Viewer should NOT receive another email

### Test notification bell

1. Log in as Viewer after the owner uploaded a new version
2. Red badge should appear on the bell icon with the count
3. Click the bell — dropdown opens showing the notification
4. Badge count drops to zero
5. Close and reopen — notification shows as read (no blue dot)

### Test polling

1. Open the dashboard
2. In another tab, trigger a new version upload via curl or another session
3. Within 30 seconds, the bell badge should update without a page refresh

### Test audit log

1. Log in as Owner
2. Click the History button on a document card
3. Should see all view events from every viewer including their IP
4. Filter by "Download" — should show only download events
5. Filter by "Upload" — should show version upload events

### Test watermark

1. Create a share link with the watermark toggle ON
2. Open the share link while logged in — watermark shows your email
3. Open in incognito — watermark shows "Shared via LivePDF"
4. Create a share link with watermark OFF — no watermark appears

### Test BullMQ worker retry

1. Stop the BullMQ worker (`Ctrl+C` in Terminal 2)
2. Upload a new version — upload should succeed immediately
3. Check Redis: `redis-cli llen bull:email-notifications:wait`
   — should show pending jobs
4. Restart the worker — emails should send immediately

---

## Common errors and fixes

| Error | Cause | Fix |
|---|---|---|
| `ECONNREFUSED` on Redis connection | Redis not running | Run `redis-server` or check `REDIS_URL` |
| BullMQ worker connects but jobs never process | Worker file not started | Run `node worker.js` in a separate terminal |
| Notification emails go to spam | Sending from Gmail personal account | Set up SPF/DKIM records or use Resend/SendGrid in production |
| Unsubscribe link gives `Invalid token` | JWT_SECRET changed after token was created | Tokens signed with old secret fail — regenerate or keep secret stable |
| Watermark appears but position is wrong | Canvas not resized after zoom | Call canvas redraw in a `useEffect` that depends on `width` and `height` |
| Audit log shows wrong IP (`::1` or `127.0.0.1`) | Running locally without a proxy | Expected in dev — in production behind nginx the real IP appears |
| Bell count never updates | Polling interval not set up | Check `useNotifications.js` — the `setInterval` should fire every 30000ms |
| `date-fns` not found | Not installed | Run `npm install date-fns` in client/ |

---

## What's next — Phase 9

Phase 9 adds the startup and deployment features:

- Subscription plans (Free / Pro / Enterprise) with Stripe payments
- Organization accounts — companies manage employees and shared document folders
- REST API access with API key management so other apps can upload and retrieve
  PDFs programmatically
- Full Docker setup with docker-compose for all services (Node, Python, Redis,
  PostgreSQL, nginx)
- GitHub Actions CI/CD pipeline that deploys to AWS EC2 on every push to main
- SSL certificate setup with Let's Encrypt via Certbot
- PM2 process management so the API server, worker, and Python service all
  restart automatically on crash or reboot
