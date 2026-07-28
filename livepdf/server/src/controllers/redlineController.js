const pool = require('../config/db');
const { emitDocUpdated } = require('../socket');
const { logAudit } = require('../utils/audit');
const s3 = require('../config/s3');
const { PutObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');

const DIFF_SERVICE_URL = process.env.DIFF_SERVICE_URL || 'http://localhost:8001';

// Helper to upload file buffer to S3 (or disk in Mock mode)
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

// GET /api/documents/:docId/redlines
async function getRedlines(req, res) {
  const { docId } = req.params;
  const { versionId } = req.query;

  try {
    const docRes = await pool.query(
      'SELECT id, current_version_id, approval_status FROM documents WHERE id = $1',
      [docId]
    );
    if (docRes.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const currentVerId = versionId || docRes.rows[0].current_version_id;

    const result = await pool.query(
      `SELECT r.*, v.version_number, u.full_name as author_full_name, u.email as author_email
       FROM redline_proposals r
       JOIN versions v ON v.id = r.version_id
       LEFT JOIN users u ON u.id = r.user_id
       WHERE r.document_id = $1
       ORDER BY r.created_at ASC`,
      [docId]
    );

    const proposals = result.rows.map(row => ({
      id: row.id,
      documentId: row.document_id,
      versionId: row.version_id,
      versionNumber: row.version_number,
      userId: row.user_id,
      authorName: row.author_full_name || row.author_name || 'Anonymous',
      authorEmail: row.author_email || '',
      pageNumber: row.page_number,
      x: parseFloat(row.x),
      y: parseFloat(row.y),
      width: parseFloat(row.width),
      height: parseFloat(row.height),
      originalText: row.original_text,
      proposedText: row.proposed_text,
      proposalType: row.proposal_type,
      status: row.status,
      appliedVersionId: row.applied_version_id,
      createdAt: row.created_at,
      decidedAt: row.decided_at,
      appliedAt: row.applied_at,
    }));

    const activeProposals = proposals.filter(p => p.versionId === currentVerId);
    const previousProposals = proposals.filter(p => p.versionId !== currentVerId);

    res.json({
      proposals,
      activeProposals,
      previousProposals,
      approvalStatus: docRes.rows[0].approval_status,
    });
  } catch (err) {
    console.error('Error fetching redline proposals:', err);
    res.status(500).json({ error: 'Failed to retrieve redline proposals' });
  }
}

// POST /api/documents/:docId/redlines
async function createRedline(req, res) {
  const { docId } = req.params;
  const {
    pageNumber,
    x,
    y,
    width,
    height,
    originalText,
    proposedText,
    proposalType = 'replacement',
    versionId,
    guestName,
  } = req.body;

  if (!originalText || !originalText.trim()) {
    return res.status(400).json({ error: 'Original text selection is required' });
  }

  try {
    const docRes = await pool.query(
      `SELECT d.*, u.email as owner_email
       FROM documents d
       JOIN users u ON u.id = d.owner_id
       WHERE d.id = $1`,
      [docId]
    );

    if (docRes.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const doc = docRes.rows[0];
    const targetVersionId = versionId || doc.current_version_id;
    const authorId = req.user ? req.user.id : null;
    const authorName = req.user
      ? req.user.full_name
      : (guestName || 'Reviewer');

    const insertRes = await pool.query(
      `INSERT INTO redline_proposals
        (document_id, version_id, user_id, author_name, page_number, x, y, width, height, original_text, proposed_text, proposal_type, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'pending')
       RETURNING *`,
      [
        docId,
        targetVersionId,
        authorId,
        authorName,
        pageNumber || 1,
        x || 0,
        y || 0,
        width || 0,
        height || 0,
        originalText.trim(),
        proposalType === 'deletion' ? null : (proposedText ? proposedText.trim() : ''),
        proposalType,
      ]
    );

    const newProposal = insertRes.rows[0];

    const verRes = await pool.query('SELECT version_number FROM versions WHERE id = $1', [targetVersionId]);
    const versionNumber = verRes.rows[0]?.version_number || 1;

    const formattedProposal = {
      id: newProposal.id,
      documentId: newProposal.document_id,
      versionId: newProposal.version_id,
      versionNumber,
      userId: newProposal.user_id,
      authorName: newProposal.author_name,
      pageNumber: newProposal.page_number,
      x: parseFloat(newProposal.x),
      y: parseFloat(newProposal.y),
      width: parseFloat(newProposal.width),
      height: parseFloat(newProposal.height),
      originalText: newProposal.original_text,
      proposedText: newProposal.proposed_text,
      proposalType: newProposal.proposal_type,
      status: newProposal.status,
      createdAt: newProposal.created_at,
    };

    logAudit(req, docId, 'redline_proposed', {
      proposalId: newProposal.id,
      proposalType,
      pageNumber: newProposal.page_number,
    }).catch(console.error);

    emitDocUpdated(docId, {
      type: 'redline:created',
      proposal: formattedProposal,
    });

    res.status(201).json(formattedProposal);
  } catch (err) {
    console.error('Error creating redline proposal:', err);
    res.status(500).json({ error: 'Failed to create redline proposal' });
  }
}

// PATCH /api/documents/:docId/redlines/:id/decision
async function updateRedlineDecision(req, res) {
  const { docId, id: proposalId } = req.params;
  const { decision } = req.body; // 'accepted' | 'rejected'

  if (!['accepted', 'rejected'].includes(decision)) {
    return res.status(400).json({ error: 'Invalid decision. Must be "accepted" or "rejected".' });
  }

  try {
    const docRes = await pool.query('SELECT owner_id FROM documents WHERE id = $1', [docId]);
    if (docRes.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    if (docRes.rows[0].owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Only the document owner can accept or reject redline proposals' });
    }

    const updateRes = await pool.query(
      `UPDATE redline_proposals
       SET status = $1, decided_at = NOW()
       WHERE id = $2 AND document_id = $3
       RETURNING *`,
      [decision, proposalId, docId]
    );

    if (updateRes.rows.length === 0) {
      return res.status(404).json({ error: 'Redline proposal not found' });
    }

    const updatedProposal = updateRes.rows[0];

    logAudit(req, docId, decision === 'accepted' ? 'redline_accepted' : 'redline_rejected', {
      proposalId,
      status: decision,
    }).catch(console.error);

    emitDocUpdated(docId, {
      type: 'redline:updated',
      proposalId,
      status: decision,
    });

    res.json({
      message: `Proposal ${decision} successfully`,
      proposal: {
        id: updatedProposal.id,
        status: updatedProposal.status,
        decidedAt: updatedProposal.decided_at,
      },
    });
  } catch (err) {
    console.error('Error updating redline decision:', err);
    res.status(500).json({ error: 'Failed to update redline proposal' });
  }
}

// POST /api/documents/:docId/redlines/apply
async function applyAcceptedRedlines(req, res) {
  const { docId } = req.params;

  try {
    const docRes = await pool.query(
      'SELECT id, owner_id, current_version_id, approval_status FROM documents WHERE id = $1',
      [docId]
    );

    if (docRes.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const doc = docRes.rows[0];

    if (doc.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Only the document owner can apply redline proposals' });
    }

    // Lock check during formal approval workflow
    if (doc.approval_status === 'Pending Review') {
      return res.status(400).json({
        error: 'Cannot apply redlines while document is in Pending Review. Please conclude the formal review round first.',
      });
    }

    // Fetch accepted proposals
    const acceptedRes = await pool.query(
      `SELECT * FROM redline_proposals
       WHERE document_id = $1 AND status = 'accepted'
       ORDER BY page_number ASC, y ASC`,
      [docId]
    );

    if (acceptedRes.rows.length === 0) {
      return res.status(400).json({ error: 'No accepted redline proposals found to apply.' });
    }

    const acceptedProposals = acceptedRes.rows;

    // Fetch current version
    const versionRes = await pool.query('SELECT * FROM versions WHERE id = $1', [doc.current_version_id]);
    if (versionRes.rows.length === 0) {
      return res.status(404).json({ error: 'Current document version not found' });
    }
    const currentVersion = versionRes.rows[0];

    // Call Python microservice to generate new PDF
    const pyPayload = {
      s3_key: currentVersion.s3_key,
      proposals: acceptedProposals.map(p => ({
        id: p.id,
        page_number: p.page_number,
        x: parseFloat(p.x),
        y: parseFloat(p.y),
        width: parseFloat(p.width),
        height: parseFloat(p.height),
        original_text: p.original_text,
        proposed_text: p.proposed_text,
        proposal_type: p.proposal_type,
      })),
    };

    const pyResponse = await axios.post(`${DIFF_SERVICE_URL}/redline/apply`, pyPayload, {
      responseType: 'arraybuffer',
      timeout: 60000,
    });

    const newPdfBuffer = Buffer.from(pyResponse.data);

    // Save as new document version
    const versionCheck = await pool.query(
      'SELECT MAX(version_number) as max_version FROM versions WHERE document_id = $1',
      [docId]
    );
    const nextVersion = (versionCheck.rows[0].max_version || 0) + 1;
    const newVersionId = uuidv4();
    const newS3Key = `${req.user.id}/${docId}/v${nextVersion}.pdf`;
    const fileSize = newPdfBuffer.length;

    await uploadFile(newS3Key, newPdfBuffer);

    // DB transaction to save version and update proposals
    const dbClient = await pool.connect();
    try {
      await dbClient.query('BEGIN');

      await dbClient.query(
        `INSERT INTO versions (id, document_id, version_number, s3_key, file_size, uploaded_by)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [newVersionId, docId, nextVersion, newS3Key, fileSize, req.user.id]
      );

      await dbClient.query(
        'UPDATE documents SET current_version_id = $1, updated_at = NOW() WHERE id = $2',
        [newVersionId, docId]
      );

      // Update proposal statuses to applied
      const proposalIds = acceptedProposals.map(p => p.id);
      await dbClient.query(
        `UPDATE redline_proposals
         SET status = 'applied', applied_at = NOW(), applied_version_id = $1
         WHERE id = ANY($2::uuid[])`,
        [newVersionId, proposalIds]
      );

      await dbClient.query('COMMIT');
    } catch (dbErr) {
      await dbClient.query('ROLLBACK');
      throw dbErr;
    } finally {
      dbClient.release();
    }

    logAudit(req, docId, 'redline_applied', {
      appliedCount: acceptedProposals.length,
      newVersionId,
      newVersionNumber: nextVersion,
    }).catch(console.error);

    // Interlock with Diff Engine (Phase 6)
    const { computeAndStoreDiff } = require('../services/diffService');
    computeAndStoreDiff(docId, currentVersion, { id: newVersionId, s3_key: newS3Key }).catch(console.error);

    // Notify connected WebSocket clients
    emitDocUpdated(docId, {
      type: 'redline:applied',
      newVersionNumber: nextVersion,
      newVersionId,
      appliedCount: acceptedProposals.length,
    });

    res.json({
      message: `Successfully applied ${acceptedProposals.length} redline proposal(s)`,
      newVersionNumber: nextVersion,
      newVersionId,
    });
  } catch (err) {
    console.error('Error applying redline proposals:', err);
    res.status(500).json({ error: err.response?.data?.detail || err.message || 'Failed to apply redlines' });
  }
}

module.exports = {
  getRedlines,
  createRedline,
  updateRedlineDecision,
  applyAcceptedRedlines,
};
