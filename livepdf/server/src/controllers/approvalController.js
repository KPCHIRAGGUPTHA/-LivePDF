const pool = require('../config/db');
const { emitDocUpdated } = require('../socket');
const { logAudit } = require('../utils/audit');

// POST /api/documents/:docId/approval/submit
async function submitForApproval(req, res) {
  const { docId } = req.params;
  const { reviewerIds, message } = req.body;

  if (!reviewerIds || !Array.isArray(reviewerIds) || reviewerIds.length === 0) {
    return res.status(400).json({ error: 'At least one designated reviewer must be selected' });
  }

  try {
    // 1. Verify owner
    const docRes = await pool.query(
      `SELECT d.*, u.full_name as owner_name FROM documents d JOIN users u ON u.id = d.owner_id WHERE d.id = $1`,
      [docId]
    );

    if (docRes.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const doc = docRes.rows[0];
    if (doc.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Only the document owner can submit for review' });
    }

    if (!doc.current_version_id) {
      return res.status(400).json({ error: 'Document must have a uploaded version to submit for review' });
    }

    // 2. Determine round number
    const roundRes = await pool.query(
      `SELECT COALESCE(MAX(round), 0) + 1 as next_round FROM document_approvals WHERE document_id = $1`,
      [docId]
    );
    const round = parseInt(roundRes.rows[0].next_round, 10);

    // 3. Update document status to Pending Review
    await pool.query(
      `UPDATE documents SET approval_status = 'Pending Review', updated_at = NOW() WHERE id = $1`,
      [docId]
    );

    // 4. Create reviewer records
    for (const reviewerId of reviewerIds) {
      await pool.query(
        `INSERT INTO document_approvals (document_id, version_id, reviewer_id, status, feedback, round)
         VALUES ($1, $2, $3, 'pending', $4, $5)
         ON CONFLICT (document_id, version_id, reviewer_id, round) DO UPDATE SET status = 'pending', feedback = $4`,
        [docId, doc.current_version_id, reviewerId, message || null, round]
      );

      // Send notification to reviewer
      const notificationMsg = `${req.user.full_name} submitted "${doc.title}" for your approval.`;
      await pool.query(
        `INSERT INTO notifications (user_id, document_id, message) VALUES ($1, $2, $3)`,
        [reviewerId, docId, notificationMsg]
      );
    }

    logAudit(req, docId, 'approval_submitted', { round, reviewersCount: reviewerIds.length }).catch(console.error);

    emitDocUpdated(docId, {
      type: 'approval:updated',
      docId,
      approvalStatus: 'Pending Review',
      round,
    });

    res.json({
      message: 'Document submitted for approval successfully',
      docId,
      approvalStatus: 'Pending Review',
      round,
    });
  } catch (err) {
    console.error('Error submitting for approval:', err);
    res.status(500).json({ error: 'Failed to submit document for approval' });
  }
}

// POST /api/documents/:docId/approval/decision
async function submitDecision(req, res) {
  const { docId } = req.params;
  const { decision, feedback } = req.body; // 'approved' | 'rejected' | 'changes_requested'

  const validDecisions = ['approved', 'rejected', 'changes_requested'];
  if (!decision || !validDecisions.includes(decision)) {
    return res.status(400).json({ error: 'Invalid decision. Must be approved, rejected, or changes_requested.' });
  }

  if ((decision === 'rejected' || decision === 'changes_requested') && (!feedback || !feedback.trim())) {
    return res.status(400).json({ error: `Reason/feedback is required when selecting ${decision.replace('_', ' ')}` });
  }

  try {
    const docRes = await pool.query(
      `SELECT d.*, u.full_name as owner_name FROM documents d JOIN users u ON u.id = d.owner_id WHERE d.id = $1`,
      [docId]
    );

    if (docRes.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const doc = docRes.rows[0];

    // Find current round
    const currentRoundRes = await pool.query(
      `SELECT MAX(round) as current_round FROM document_approvals WHERE document_id = $1`,
      [docId]
    );
    const round = currentRoundRes.rows[0]?.current_round;

    if (!round) {
      return res.status(400).json({ error: 'No active review round found for this document' });
    }

    // Check if user is a designated reviewer in this round
    const reviewRecord = await pool.query(
      `SELECT * FROM document_approvals WHERE document_id = $1 AND reviewer_id = $2 AND round = $3`,
      [docId, req.user.id, round]
    );

    if (reviewRecord.rows.length === 0) {
      return res.status(403).json({ error: 'You are not assigned as a reviewer for this document round' });
    }

    // Update reviewer decision
    await pool.query(
      `UPDATE document_approvals 
       SET status = $1, feedback = $2, updated_at = NOW() 
       WHERE document_id = $3 AND reviewer_id = $4 AND round = $5`,
      [decision, feedback ? feedback.trim() : null, docId, req.user.id, round]
    );

    // Evaluate round status across all reviewers
    const allReviewersRes = await pool.query(
      `SELECT status FROM document_approvals WHERE document_id = $1 AND round = $2`,
      [docId, round]
    );

    const statuses = allReviewersRes.rows.map(r => r.status);
    let newDocStatus = 'Pending Review';

    if (statuses.includes('rejected')) {
      newDocStatus = 'Rejected';
    } else if (statuses.includes('changes_requested')) {
      newDocStatus = 'Changes Requested';
    } else if (statuses.every(s => s === 'approved')) {
      newDocStatus = 'Approved';
    } else {
      newDocStatus = 'Pending Review';
    }

    await pool.query(
      `UPDATE documents SET approval_status = $1, updated_at = NOW() WHERE id = $2`,
      [newDocStatus, docId]
    );

    // Notify document owner
    const humanDecision = decision === 'changes_requested' ? 'requested changes on' : `${decision} your document`;
    await pool.query(
      `INSERT INTO notifications (user_id, document_id, message) VALUES ($1, $2, $3)`,
      [doc.owner_id, docId, `${req.user.full_name} ${humanDecision} "${doc.title}".`]
    );

    logAudit(req, docId, `approval_${decision}`, { round, decision, feedback }).catch(console.error);

    emitDocUpdated(docId, {
      type: 'approval:updated',
      docId,
      approvalStatus: newDocStatus,
      reviewerId: req.user.id,
      reviewerName: req.user.full_name,
      decision,
      round,
    });

    res.json({
      message: `Review decision logged as ${decision}`,
      docId,
      approvalStatus: newDocStatus,
      decision,
    });
  } catch (err) {
    console.error('Error submitting decision:', err);
    res.status(500).json({ error: 'Failed to record review decision' });
  }
}

// GET /api/documents/:docId/approval/history
async function getApprovalHistory(req, res) {
  const { docId } = req.params;

  try {
    const docRes = await pool.query(`SELECT id, title, approval_status FROM documents WHERE id = $1`, [docId]);
    if (docRes.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const historyRes = await pool.query(
      `SELECT da.*, u.full_name as reviewer_name, u.email as reviewer_email, v.version_number
       FROM document_approvals da
       JOIN users u ON u.id = da.reviewer_id
       JOIN versions v ON v.id = da.version_id
       WHERE da.document_id = $1
       ORDER BY da.round DESC, da.created_at ASC`,
      [docId]
    );

    // Group history by round
    const roundsMap = {};
    historyRes.rows.forEach(row => {
      if (!roundsMap[row.round]) {
        roundsMap[row.round] = {
          round: row.round,
          versionNumber: row.version_number,
          reviewers: [],
        };
      }
      roundsMap[row.round].reviewers.push({
        id: row.id,
        reviewerId: row.reviewer_id,
        reviewerName: row.reviewer_name,
        reviewerEmail: row.reviewer_email,
        status: row.status,
        feedback: row.feedback,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      });
    });

    const rounds = Object.values(roundsMap);

    res.json({
      docId,
      approvalStatus: docRes.rows[0].approval_status || 'Draft',
      rounds,
    });
  } catch (err) {
    console.error('Error getting approval history:', err);
    res.status(500).json({ error: 'Failed to load approval history' });
  }
}

module.exports = {
  submitForApproval,
  submitDecision,
  getApprovalHistory,
};
