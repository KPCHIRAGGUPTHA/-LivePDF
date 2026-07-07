const s3 = require('../config/s3');
const { PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl: getAWSSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { emitDocUpdated } = require('../socket');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const pool = require('../config/db');
const { logAudit } = require('../utils/audit');
const { emailQueue } = require('../services/queueService');


// Helper to upload file to S3 (or write to disk in Mock Mode)
async function uploadFile(key, buffer) {
  if (s3.isMock) {
    const filePath = path.join(s3.uploadsDir, key);
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, buffer);
    return;
  }
  
  const command = new PutObjectCommand({
    Bucket: process.env.S3_BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: 'application/pdf',
  });
  await s3.send(command);
}

// Helper to delete file from S3 (or unlink from disk in Mock Mode)
async function deleteFile(key) {
  if (s3.isMock) {
    const filePath = path.join(s3.uploadsDir, key);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    
    // Clean up empty directories
    const dir = path.dirname(filePath);
    if (fs.existsSync(dir) && fs.readdirSync(dir).length === 0) {
      fs.rmdirSync(dir);
      const parentDir = path.dirname(dir);
      if (fs.existsSync(parentDir) && fs.readdirSync(parentDir).length === 0) {
        fs.rmdirSync(parentDir);
      }
    }
    return;
  }
  
  const command = new DeleteObjectCommand({
    Bucket: process.env.S3_BUCKET_NAME,
    Key: key,
  });
  await s3.send(command);
}

// Helper to generate signed url (or server relative url in Mock Mode)
async function getFileUrl(key, req) {
  if (s3.isMock) {
    const protocol = req.protocol;
    const host = req.get('host');
    return `${protocol}://${host}/api/documents/mock-download/${key}`;
  }
  
  const command = new GetObjectCommand({
    Bucket: process.env.S3_BUCKET_NAME,
    Key: key,
  });
  return await getAWSSignedUrl(s3, command, { expiresIn: 900 }); // 15 min
}

// ─── POST /documents/upload ──────────────────────────────────────────
async function uploadDocument(req, res) {
  if (!req.file) {
    return res.status(400).json({ error: 'Please upload a PDF file' });
  }

  const { title, organisationId } = req.body;
  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'Document title is required' });
  }

  const docId = uuidv4();
  const versionId = uuidv4();
  const s3Key = `${req.user.id}/${docId}/v1.pdf`;
  const fileSize = req.file.size;

  try {
    // 1. Upload the PDF file
    await uploadFile(s3Key, req.file.buffer);

    // 2. Perform DB operations in a transaction
    const dbClient = await pool.connect();
    try {
      await dbClient.query('BEGIN');

      // Insert new document
      await dbClient.query(
        'INSERT INTO documents (id, owner_id, title) VALUES ($1, $2, $3)',
        [docId, req.user.id, title.trim()]
      );

      // Insert version 1
      await dbClient.query(
        `INSERT INTO versions (id, document_id, version_number, s3_key, file_size, uploaded_by)
         VALUES ($1, $2, 1, $3, $4, $5)`,
        [versionId, docId, s3Key, fileSize, req.user.id]
      );

      // Update current version reference
      await dbClient.query(
        'UPDATE documents SET current_version_id = $1 WHERE id = $2',
        [versionId, docId]
      );

      // Link to organisation if provided
      if (organisationId) {
        const memberRes = await dbClient.query(
          'SELECT role FROM organisation_members WHERE organisation_id = $1 AND user_id = $2',
          [organisationId, req.user.id]
        );
        if (memberRes.rows.length > 0 && ['admin', 'editor'].includes(memberRes.rows[0].role)) {
          await dbClient.query(
            'INSERT INTO organisation_documents (organisation_id, document_id) VALUES ($1, $2)',
            [organisationId, docId]
          );
        }
      }

      await dbClient.query('COMMIT');
    } catch (dbErr) {
      await dbClient.query('ROLLBACK');
      // Attempt S3 cleanup
      try { await deleteFile(s3Key); } catch (s3Err) { console.error('S3 Cleanup error:', s3Err); }
      throw dbErr;
    } finally {
      dbClient.release();
    }

    // Trigger embedding generation asynchronously
    ;(async () => {
      let parser;
      try {
        const { storeEmbeddings } = require('../services/embeddingService');
        const { PDFParse } = require('pdf-parse');
        
        parser = new PDFParse({ data: req.file.buffer });
        const result = await parser.getText();
        const pageTexts = result.pages.map(p => ({
          pageNumber: p.num - 1, // convert 1-indexed to 0-indexed
          text: p.text.trim(),
        })).filter(p => p.text.length > 0);

        await storeEmbeddings(docId, versionId, pageTexts);
      } catch (err) {
        console.error('Embedding generation failed for document upload:', err.message);
      } finally {
        if (parser) {
          try { await parser.destroy(); } catch (e) {}
        }
      }
    })();

    res.status(201).json({
      documentId: docId,
      versionNumber: 1,
      message: 'Document uploaded successfully',
    });
  } catch (err) {
    console.error('Upload document error:', err);
    res.status(500).json({ error: 'Server error during upload' });
  }
}

// ─── POST /documents/:id/upload-version ────────────────────────────────
async function uploadNewVersion(req, res) {
  const docId = req.params.id;

  if (!req.file) {
    return res.status(400).json({ error: 'Please upload a PDF file' });
  }

  try {
    // 1. Verify ownership of the document or organization access (admin/editor)
    const permissionRes = await pool.query(
      `SELECT d.owner_id, om.role
       FROM documents d
       LEFT JOIN organisation_documents od ON d.id = od.document_id
       LEFT JOIN organisation_members om ON od.organisation_id = om.organisation_id AND om.user_id = $2
       WHERE d.id = $1`,
      [docId, req.user.id]
    );

    if (permissionRes.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const { owner_id, role } = permissionRes.rows[0];
    const isOwner = owner_id === req.user.id;
    const isOrgWriter = role === 'admin' || role === 'editor';

    if (!isOwner && !isOrgWriter) {
      return res.status(403).json({ error: 'Access denied: You do not have permission to upload versions to this document' });
    }

    // 2. Fetch the current max version number
    const versionCheck = await pool.query(
      'SELECT MAX(version_number) as max_version FROM versions WHERE document_id = $1',
      [docId]
    );

    const nextVersion = (versionCheck.rows[0].max_version || 0) + 1;
    const s3Key = `${owner_id}/${docId}/v${nextVersion}.pdf`;
    const fileSize = req.file.size;
    const versionId = uuidv4();

    // 3. Upload new version file
    await uploadFile(s3Key, req.file.buffer);

    // 4. Save to DB in transaction
    const dbClient = await pool.connect();
    try {
      await dbClient.query('BEGIN');

      // Insert new version
      await dbClient.query(
        `INSERT INTO versions (id, document_id, version_number, s3_key, file_size, uploaded_by)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [versionId, docId, nextVersion, s3Key, fileSize, req.user.id]
      );

      // Update current version pointer and update timestamp
      await dbClient.query(
        'UPDATE documents SET current_version_id = $1, updated_at = NOW() WHERE id = $2',
        [versionId, docId]
      );

      await dbClient.query('COMMIT');
      logAudit(req, docId, 'upload', { versionNumber: nextVersion }).catch(console.error);
      
      // Enqueue background email alerts job
      emailQueue.add('sendEmailAlerts', {
        documentId: docId,
        versionNumber: nextVersion,
        newVersionId: versionId,
        ownerId: req.user.id
      }).then(job => {
        console.log(`Enqueued email alerts job ${job.id} for doc ${docId} version ${nextVersion}`);
      }).catch(err => {
        console.error('Failed to enqueue email alerts job:', err.message);
      });
    } catch (dbErr) {
      await dbClient.query('ROLLBACK');
      try { await deleteFile(s3Key); } catch (s3Err) { console.error('S3 Cleanup error:', s3Err); }
      throw dbErr;
    } finally {
      dbClient.release();
    }

    // Generate fresh signed URL and notify all open viewers
    try {
      const freshSignedUrl = await getFileUrl(s3Key, req);
      emitDocUpdated(docId, {
        versionNumber: nextVersion,
        signedUrl: freshSignedUrl,
        updatedAt: new Date().toISOString(),
      });
    } catch (emitErr) {
      console.error('Error emitting doc update:', emitErr);
    }

    // Fetch the previous version's S3 key for the diff
    try {
      const prevVersionResult = await pool.query(
        `SELECT id, s3_key FROM versions
         WHERE document_id = $1 AND version_number = $2`,
        [docId, nextVersion - 1]
      );

      if (prevVersionResult.rows.length > 0) {
        const oldVersion = prevVersionResult.rows[0];
        const newVersion = { id: versionId, s3_key: s3Key };

        // Run diff asynchronously — do NOT await
        const { computeAndStoreDiff } = require('../services/diffService');
        computeAndStoreDiff(docId, oldVersion, newVersion).catch(console.error);
      }
    } catch (diffTriggerErr) {
      console.error('Failed to trigger diff service:', diffTriggerErr);
    }

    // Trigger embedding generation asynchronously
    ;(async () => {
      let parser;
      try {
        const { storeEmbeddings } = require('../services/embeddingService');
        const { PDFParse } = require('pdf-parse');
        
        parser = new PDFParse({ data: req.file.buffer });
        const result = await parser.getText();
        const pageTexts = result.pages.map(p => ({
          pageNumber: p.num - 1, // convert 1-indexed to 0-indexed
          text: p.text.trim(),
        })).filter(p => p.text.length > 0);

        await storeEmbeddings(docId, versionId, pageTexts);
      } catch (err) {
        console.error('Embedding generation failed for version upload:', err.message);
      } finally {
        if (parser) {
          try { await parser.destroy(); } catch (e) {}
        }
      }
    })();

    res.json({
      versionNumber: nextVersion,
      message: 'New version uploaded successfully',
    });
  } catch (err) {
    console.error('Replace version error:', err);
    res.status(500).json({ error: 'Server error during version replacement' });
  }
}

// ─── DELETE /documents/:id ──────────────────────────────────────────
async function deleteDocument(req, res) {
  const docId = req.params.id;

  try {
    // 1. Verify ownership of the document
    const docCheck = await pool.query(
      'SELECT owner_id FROM documents WHERE id = $1',
      [docId]
    );

    if (docCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    if (docCheck.rows[0].owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied: You do not own this document' });
    }

    // 2. Query all versions to find S3 keys for deletion
    const versions = await pool.query(
      'SELECT s3_key FROM versions WHERE document_id = $1',
      [docId]
    );

    // 3. Delete files from S3/disk
    for (const row of versions.rows) {
      try {
        await deleteFile(row.s3_key);
      } catch (s3Err) {
        console.error(`Failed to delete S3 key ${row.s3_key}:`, s3Err);
      }
    }

    // 4. Delete document from PostgreSQL (cascades automatically to versions and share links)
    await pool.query('DELETE FROM documents WHERE id = $1', [docId]);
    logAudit(req, docId, 'delete_document').catch(console.error);

    res.json({ message: 'Document and all associated versions deleted successfully' });
  } catch (err) {
    console.error('Delete document error:', err);
    res.status(500).json({ error: 'Server error during deletion' });
  }
}

// ─── GET /documents ──────────────────────────────────────────────────
async function listDocuments(req, res) {
  try {
    const result = await pool.query(
      `SELECT DISTINCT
         d.id, 
         d.title, 
         d.created_at, 
         d.updated_at,
         d.owner_id,
         v.version_number, 
         v.file_size, 
         v.uploaded_at,
         o.name AS organisation_name
       FROM documents d
       JOIN versions v ON v.id = d.current_version_id
       LEFT JOIN organisation_documents od ON d.id = od.document_id
       LEFT JOIN organisations o ON od.organisation_id = o.id
       LEFT JOIN organisation_members om ON o.id = om.organisation_id
       WHERE d.owner_id = $1 OR om.user_id = $1
       ORDER BY d.updated_at DESC`,
      [req.user.id]
    );

    res.json(result.rows);
  } catch (err) {
    console.error('List documents error:', err);
    res.status(500).json({ error: 'Server error while fetching documents' });
  }
}

// ─── GET /documents/:id/signed-url ──────────────────────────────────
async function getSignedUrl(req, res) {
  const docId = req.params.id;

  try {
    // Verify document exists and requester owns it or has access via organisation
    const result = await pool.query(
      `SELECT d.owner_id, v.s3_key 
       FROM documents d
       JOIN versions v ON v.id = d.current_version_id
       LEFT JOIN organisation_documents od ON d.id = od.document_id
       LEFT JOIN organisation_members om ON od.organisation_id = om.organisation_id
       WHERE d.id = $1 AND (d.owner_id = $2 OR om.user_id = $2)`,
      [docId, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied or Document not found' });
    }

    const { s3_key } = result.rows[0];

    const url = await getFileUrl(s3_key, req);
    res.json({ url });
  } catch (err) {
    console.error('Get signed URL error:', err);
    res.status(500).json({ error: 'Server error while generating view link' });
  }
}

// ─── GET /documents/mock-download/:userId/:docId/:filename ───────────
async function mockDownload(req, res) {
  const { userId, docId, filename } = req.params;

  if (!s3.isMock) {
    return res.status(400).json({ error: 'Mock download is only available in S3 Mock Mode' });
  }

  const filePath = path.join(s3.uploadsDir, userId, docId, filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
  fs.createReadStream(filePath).pipe(res);
}

// ─── GET /documents/:id/versions ─────────────────────────────────────
async function listDocumentVersions(req, res) {
  const docId = req.params.id;
  try {
    // Verify user has access to document via owner_id or organization member
    const docCheck = await pool.query(
      `SELECT d.id 
       FROM documents d
       LEFT JOIN organisation_documents od ON d.id = od.document_id
       LEFT JOIN organisation_members om ON od.organisation_id = om.organisation_id
       WHERE d.id = $1 AND (d.owner_id = $2 OR om.user_id = $2)`,
      [docId, req.user.id]
    );
    if (docCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied or Document not found' });
    }

    const versions = await pool.query(
      `SELECT id, version_number, file_size, uploaded_at 
       FROM versions 
       WHERE document_id = $1 
       ORDER BY version_number DESC`,
      [docId]
    );
    res.json(versions.rows);
  } catch (err) {
    console.error('List versions error:', err);
    res.status(500).json({ error: 'Server error while fetching versions' });
  }
}

// ─── GET /documents/:id/versions/:versionNumber/signed-url ────────────
async function getSignedUrlForVersion(req, res) {
  const docId = req.params.id;
  const versionNumber = parseInt(req.params.versionNumber, 10);
  try {
    // Verify user has access to document
    const docCheck = await pool.query(
      `SELECT d.id 
       FROM documents d
       LEFT JOIN organisation_documents od ON d.id = od.document_id
       LEFT JOIN organisation_members om ON od.organisation_id = om.organisation_id
       WHERE d.id = $1 AND (d.owner_id = $2 OR om.user_id = $2)`,
      [docId, req.user.id]
    );
    if (docCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied or Document not found' });
    }

    const versionCheck = await pool.query(
      'SELECT s3_key FROM versions WHERE document_id = $1 AND version_number = $2',
      [docId, versionNumber]
    );
    if (versionCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Version not found' });
    }

    const url = await getFileUrl(versionCheck.rows[0].s3_key, req);
    res.json({ url });
  } catch (err) {
    console.error('Get version signed URL error:', err);
    res.status(500).json({ error: 'Server error while generating URL' });
  }
}

async function getVersionDiff(req, res) {
  const { oldVersionId, newVersionId } = req.query;
  if (!oldVersionId || !newVersionId) {
    return res.status(400).json({ error: 'oldVersionId and newVersionId query parameters are required' });
  }
  try {
    // Verify user has access to document
    const docCheck = await pool.query(
      `SELECT d.id 
       FROM versions v
       JOIN documents d ON v.document_id = d.id
       LEFT JOIN organisation_documents od ON d.id = od.document_id
       LEFT JOIN organisation_members om ON od.organisation_id = om.organisation_id
       WHERE v.id = $1 AND (d.owner_id = $2 OR om.user_id = $2)`,
      [newVersionId, req.user.id]
    );
    if (docCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { getDiff } = require('../services/diffService');
    const diff = await getDiff(oldVersionId, newVersionId);
    if (!diff) {
      return res.status(404).json({ error: 'Diff not computed yet or not found' });
    }
    res.json(diff);
  } catch (err) {
    console.error('Get version diff error:', err);
    res.status(500).json({ error: 'Server error while fetching diff' });
  }
}

async function getDocumentAuditLogs(req, res) {
  const documentId = req.params.id;
  const { action } = req.query;

  try {
    const docCheck = await pool.query(
      'SELECT owner_id FROM documents WHERE id = $1',
      [documentId]
    );

    if (docCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    if (docCheck.rows[0].owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied: You do not own this document' });
    }

    let queryText = `
      SELECT 
        al.id, 
        al.action, 
        al.ip_address, 
        al.metadata, 
        al.created_at,
        u.email AS viewer_email,
        COALESCE(u.full_name, 'Anonymous') AS viewer_name
      FROM audit_logs al
      LEFT JOIN users u ON u.id = al.user_id
      WHERE al.document_id = $1
    `;
    const params = [documentId];

    if (action) {
      queryText += ' AND al.action = $2';
      params.push(action);
    }

    queryText += ' ORDER BY al.created_at DESC';

    const result = await pool.query(queryText, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Get audit logs error:', err);
    res.status(500).json({ error: 'Server error while fetching logs' });
  }
}

module.exports = {
  uploadDocument,
  uploadNewVersion,
  deleteDocument,
  listDocuments,
  getSignedUrl,
  mockDownload,
  listDocumentVersions,
  getSignedUrlForVersion,
  getVersionDiff,
  getDocumentAuditLogs,
};
