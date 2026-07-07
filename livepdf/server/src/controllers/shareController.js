const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const s3 = require('../config/s3');
const { GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl: getAWSSignedUrl } = require('@aws-sdk/s3-request-presigner');
const pool = require('../config/db');
const { logAudit } = require('../utils/audit');

function generateToken() {
  // 32 random bytes → 64 character hex string
  return crypto.randomBytes(32).toString('hex');
}

// Helper to get signed PDF URL (works in both AWS and Mock Mode)
async function getSignedPdfUrl(versionId, req) {
  const result = await pool.query(
    'SELECT s3_key FROM versions WHERE id = $1',
    [versionId]
  );
  if (result.rows.length === 0) {
    throw new Error('Version not found');
  }
  const s3Key = result.rows[0].s3_key;

  if (s3.isMock) {
    const protocol = req.protocol;
    const host = req.get('host');
    return `${protocol}://${host}/api/documents/mock-download/${s3Key}`;
  }

  const command = new GetObjectCommand({
    Bucket: process.env.S3_BUCKET_NAME,
    Key: s3Key,
  });
  return await getAWSSignedUrl(s3, command, { expiresIn: 900 }); // 15 min
}

// ─── POST /api/share/documents/:id/share ──────────────────────────────
async function createShareLink(req, res) {
  const { id: documentId } = req.params;
  const {
    linkType,        // 'public' | 'private' | 'protected'
    password,        // only for protected
    allowedEmails,   // only for private — array of strings
    allowDownload,   // boolean, default true
    expiresAt,       // ISO date string or null
    showWatermark,   // boolean, default false
  } = req.body;

  try {
    // 1. Verify ownership
    const doc = await pool.query(
      'SELECT id FROM documents WHERE id = $1 AND owner_id = $2',
      [documentId, req.user.id]
    );
    if (doc.rows.length === 0) {
      return res.status(403).json({ error: 'Document not found or access denied' });
    }

    let passwordHash = null;
    if (linkType === 'protected') {
      if (!password || !password.trim()) {
        return res.status(400).json({ error: 'Password required for protected links' });
      }
      passwordHash = await bcrypt.hash(password, 10);
    }

    if (linkType === 'private') {
      if (!allowedEmails || allowedEmails.length === 0) {
        return res.status(400).json({ error: 'At least one email required for private links' });
      }
    }

    const token = generateToken();

    const result = await pool.query(
      `INSERT INTO share_links
        (document_id, token, link_type, password_hash, allow_download, expires_at, created_by, show_watermark)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, token, link_type, allow_download, expires_at, created_at, show_watermark`,
      [documentId, token, linkType, passwordHash,
       allowDownload ?? true, expiresAt || null, req.user.id, showWatermark ?? false]
    );

    const link = result.rows[0];

    // For private links — store allowed emails
    if (linkType === 'private' && allowedEmails?.length > 0) {
      const emailInserts = allowedEmails.map(email =>
        pool.query(
          'INSERT INTO share_link_recipients (share_link_id, email) VALUES ($1, $2)',
          [link.id, email.trim().toLowerCase()]
        )
      );
      await Promise.all(emailInserts);
    }

    logAudit(req, documentId, 'share', { token: link.token, linkType: link.link_type, showWatermark: link.show_watermark }).catch(console.error);

    res.status(201).json({
      url: `${process.env.CLIENT_URL}/view/${token}`,
      linkId: link.id,
      token: link.token,
      linkType: link.link_type,
      allowDownload: link.allow_download,
      showWatermark: link.show_watermark,
      expiresAt: link.expires_at,
      createdAt: link.created_at,
    });
  } catch (err) {
    console.error('Create share link error:', err);
    res.status(500).json({ error: 'Server error while generating share link' });
  }
}

// ─── GET /api/share/:token ───────────────────────────────────────────
async function resolveToken(req, res) {
  const { token } = req.params;
  const { version } = req.query;

  try {
    // 1. Find the share link
    const linkResult = await pool.query(
      `SELECT sl.*, d.current_version_id, d.title
       FROM share_links sl
       JOIN documents d ON d.id = sl.document_id
       WHERE sl.token = $1`,
      [token]
    );

    if (linkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Link not found' });
    }

    const link = linkResult.rows[0];

    // 2. Check expiry
    if (link.expires_at && new Date() > new Date(link.expires_at)) {
      return res.status(410).json({ error: 'This link has expired' });
    }

    // 3. Check link type
    if (link.link_type === 'protected') {
      // Password must be submitted via POST /unlock — not here
      return res.status(401).json({
        requiresPassword: true,
        title: link.title,
        allowDownload: link.allow_download,
      });
    }

    if (link.link_type === 'private') {
      // Must be logged in and email must be in recipients list
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ requiresLogin: true });
      }
      try {
        const decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
        const allowed = await pool.query(
          'SELECT id FROM share_link_recipients WHERE share_link_id = $1 AND email = $2',
          [link.id, decoded.email.toLowerCase()]
        );
        if (allowed.rows.length === 0) {
          return res.status(403).json({ error: 'You do not have access to this document' });
        }
      } catch (jwtErr) {
        return res.status(401).json({ requiresLogin: true });
      }
    }

    // 4. Resolve the correct version ID
    let versionId = link.current_version_id;
    let selectedVersion = null;

    if (version) {
      const versionNum = parseInt(version, 10);
      const versionResult = await pool.query(
        'SELECT id, version_number FROM versions WHERE document_id = $1 AND version_number = $2',
        [link.document_id, versionNum]
      );
      if (versionResult.rows.length === 0) {
        return res.status(404).json({ error: 'Specified version not found' });
      }
      versionId = versionResult.rows[0].id;
      selectedVersion = versionResult.rows[0].version_number;
    }

    // 5. Fetch all available versions for this document
    const versionsResult = await pool.query(
      `SELECT id, version_number, file_size, uploaded_at 
       FROM versions 
       WHERE document_id = $1 
       ORDER BY version_number DESC`,
      [link.document_id]
    );

    // 6. All checks passed — get signed URL
    const signedUrl = await getSignedPdfUrl(versionId, req);

    // Get the version number for the resolved versionId
    const resolvedVersionResult = await pool.query(
      'SELECT version_number FROM versions WHERE id = $1',
      [versionId]
    );
    const resolvedVersionNum = resolvedVersionResult.rows[0]?.version_number || 1;

    // 7. Log the view
    logAudit(req, link.document_id, 'view', { token, linkType: link.link_type, version: selectedVersion || 'latest' }).catch(console.error);

    let diff = null;
    try {
      const prevVersionResult = await pool.query(
        'SELECT id FROM versions WHERE document_id = $1 AND version_number = $2',
        [link.document_id, resolvedVersionNum - 1]
      );
      if (prevVersionResult.rows.length > 0) {
        const oldVersionId = prevVersionResult.rows[0].id;
        const diffResult = await pool.query(
          `SELECT change_map, total_changes, added_count, removed_count, modified_count
           FROM version_diffs
           WHERE old_version_id = $1 AND new_version_id = $2`,
          [oldVersionId, versionId]
        );
        if (diffResult.rows.length > 0) {
          diff = {
            changeMap: diffResult.rows[0].change_map,
            totalChanges: diffResult.rows[0].total_changes,
            addedCount: diffResult.rows[0].added_count,
            removedCount: diffResult.rows[0].removed_count,
            modifiedCount: diffResult.rows[0].modified_count,
          };
        }
      }
    } catch (diffErr) {
      console.error('Failed to resolve diff on load:', diffErr);
    }

    res.json({
      signedUrl,
      title: link.title,
      allowDownload: link.allow_download,
      showWatermark: link.show_watermark,
      documentId: link.document_id,
      versionNumber: resolvedVersionNum,
      linkType: link.link_type,
      diff,
      versions: versionsResult.rows.map(v => ({
        id: v.id,
        versionNumber: v.version_number,
        fileSize: v.file_size,
        uploadedAt: v.uploaded_at
      }))
    });
  } catch (err) {
    console.error('Resolve token error:', err);
    res.status(500).json({ error: 'Server error while loading link' });
  }
}

// ─── POST /api/share/:token/unlock ────────────────────────────────────
async function unlockProtectedLink(req, res) {
  const { token } = req.params;
  const { password, versionNumber } = req.body;

  if (!password) {
    return res.status(400).json({ error: 'Password required' });
  }

  try {
    const linkResult = await pool.query(
      `SELECT sl.*, d.current_version_id, d.title
       FROM share_links sl
       JOIN documents d ON d.id = sl.document_id
       WHERE sl.token = $1 AND sl.link_type = 'protected'`,
      [token]
    );

    // Always return 401 Incorrect password to prevent token discovery
    if (linkResult.rows.length === 0) {
      return res.status(401).json({ error: 'Incorrect password' });
    }

    const link = linkResult.rows[0];

    // Check expiry
    if (link.expires_at && new Date() > new Date(link.expires_at)) {
      return res.status(410).json({ error: 'This link has expired' });
    }

    const passwordMatch = await bcrypt.compare(password, link.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Incorrect password' });
    }

    // Resolve specific version ID if requested
    let versionId = link.current_version_id;
    let selectedVersion = null;

    if (versionNumber) {
      const versionNum = parseInt(versionNumber, 10);
      const versionResult = await pool.query(
        'SELECT id, version_number FROM versions WHERE document_id = $1 AND version_number = $2',
        [link.document_id, versionNum]
      );
      if (versionResult.rows.length === 0) {
        return res.status(404).json({ error: 'Specified version not found' });
      }
      versionId = versionResult.rows[0].id;
      selectedVersion = versionResult.rows[0].version_number;
    }

    // Fetch all available versions for this document
    const versionsResult = await pool.query(
      `SELECT id, version_number, file_size, uploaded_at 
       FROM versions 
       WHERE document_id = $1 
       ORDER BY version_number DESC`,
      [link.document_id]
    );

    const signedUrl = await getSignedPdfUrl(versionId, req);

    // Get the version number for the resolved versionId
    const resolvedVersionResult = await pool.query(
      'SELECT version_number FROM versions WHERE id = $1',
      [versionId]
    );
    const resolvedVersionNum = resolvedVersionResult.rows[0]?.version_number || 1;

    // Log the view
    logAudit(req, link.document_id, 'view', { token, linkType: 'protected', version: selectedVersion || 'latest' }).catch(console.error);

    let diff = null;
    try {
      const prevVersionResult = await pool.query(
        'SELECT id FROM versions WHERE document_id = $1 AND version_number = $2',
        [link.document_id, resolvedVersionNum - 1]
      );
      if (prevVersionResult.rows.length > 0) {
        const oldVersionId = prevVersionResult.rows[0].id;
        const diffResult = await pool.query(
          `SELECT change_map, total_changes, added_count, removed_count, modified_count
           FROM version_diffs
           WHERE old_version_id = $1 AND new_version_id = $2`,
          [oldVersionId, versionId]
        );
        if (diffResult.rows.length > 0) {
          diff = {
            changeMap: diffResult.rows[0].change_map,
            totalChanges: diffResult.rows[0].total_changes,
            addedCount: diffResult.rows[0].added_count,
            removedCount: diffResult.rows[0].removed_count,
            modifiedCount: diffResult.rows[0].modified_count,
          };
        }
      }
    } catch (diffErr) {
      console.error('Failed to resolve diff on load:', diffErr);
    }

    res.json({
      signedUrl,
      title: link.title,
      allowDownload: link.allow_download,
      showWatermark: link.show_watermark,
      documentId: link.document_id,
      versionNumber: resolvedVersionNum,
      linkType: 'protected',
      diff,
      versions: versionsResult.rows.map(v => ({
        id: v.id,
        versionNumber: v.version_number,
        fileSize: v.file_size,
        uploadedAt: v.uploaded_at
      }))
    });
  } catch (err) {
    console.error('Unlock protected link error:', err);
    res.status(500).json({ error: 'Server error during unlock' });
  }
}

// ─── GET /api/share/documents/:id/share-links ─────────────────────────
async function listShareLinks(req, res) {
  try {
    // Verify ownership first
    const doc = await pool.query(
      'SELECT id FROM documents WHERE id = $1 AND owner_id = $2',
      [req.params.id, req.user.id]
    );
    if (doc.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const links = await pool.query(
      `SELECT id, token, link_type, allow_download, expires_at, created_at,
              (SELECT COUNT(*) FROM audit_logs
               WHERE document_id = $1
               AND metadata->>'token' = token) AS view_count
       FROM share_links
       WHERE document_id = $1
       ORDER BY created_at DESC`,
      [req.params.id]
    );

    res.json(links.rows.map(l => ({
      ...l,
      url: `${process.env.CLIENT_URL}/view/${l.token}`,
    })));
  } catch (err) {
    console.error('List share links error:', err);
    res.status(500).json({ error: 'Server error while listing share links' });
  }
}

// ─── DELETE /api/share/:linkId ────────────────────────────────────────
async function deleteShareLink(req, res) {
  try {
    // Verify ownership via join
    const result = await pool.query(
      `DELETE FROM share_links sl
       USING documents d
       WHERE sl.id = $1
         AND sl.document_id = d.id
         AND d.owner_id = $2
       RETURNING sl.id, sl.document_id, sl.token`,
      [req.params.linkId, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(403).json({ error: 'Link not found or access denied' });
    }

    logAudit(req, result.rows[0].document_id, 'delete_link', { token: result.rows[0].token }).catch(console.error);

    res.json({ message: 'Link deleted successfully' });
  } catch (err) {
    console.error('Delete share link error:', err);
    res.status(500).json({ error: 'Server error while deleting share link' });
  }
}

async function getLatestVersion(req, res) {
  const { token } = req.params;

  try {
    const linkResult = await pool.query(
      `SELECT sl.document_id, v.id as version_id, v.version_number
       FROM share_links sl
       JOIN documents d ON d.id = sl.document_id
       JOIN versions v ON v.id = d.current_version_id
       WHERE sl.token = $1`,
      [token]
    );

    if (linkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Link not found' });
    }

    const row = linkResult.rows[0];
    const signedUrl = await getSignedPdfUrl(row.version_id, req);

    res.json({
      versionNumber: row.version_number,
      signedUrl,
    });
  } catch (err) {
    console.error('Get latest version error:', err);
    res.status(500).json({ error: 'Server error while fetching latest version' });
  }
}

async function logDownload(req, res) {
  const { token } = req.params;
  const { versionNumber } = req.body;

  try {
    // 1. Find the share link
    const linkResult = await pool.query(
      `SELECT sl.*, d.title
       FROM share_links sl
       JOIN documents d ON d.id = sl.document_id
       WHERE sl.token = $1`,
      [token]
    );

    if (linkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Link not found' });
    }

    const link = linkResult.rows[0];

    // 2. Check expiry
    if (link.expires_at && new Date() > new Date(link.expires_at)) {
      return res.status(410).json({ error: 'This link has expired' });
    }

    // 3. Check if downloading is allowed
    if (!link.allow_download) {
      return res.status(403).json({ error: 'Downloading is disabled for this link' });
    }

    // 4. Log the download action
    logAudit(req, link.document_id, 'download', {
      token,
      linkType: link.link_type,
      version: versionNumber || 'latest'
    }).catch(console.error);

    res.json({ message: 'Download logged successfully' });
  } catch (err) {
    console.error('Log download error:', err);
    res.status(500).json({ error: 'Server error while logging download' });
  }
}

module.exports = {
  createShareLink,
  resolveToken,
  unlockProtectedLink,
  listShareLinks,
  deleteShareLink,
  getLatestVersion,
  logDownload,
};
