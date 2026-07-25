const pool = require('../config/db');
const { emitDocUpdated } = require('../socket');
const { logAudit } = require('../utils/audit');
const http = require('http');
const https = require('https');

// Helper to parse @mentions from content
async function processMentions(docId, docTitle, authorName, authorId, content) {
  try {
    // Regex matches @UserName or @[User Name](uuid)
    const mentionRegex = /@\[([^\]]+)\]\(([^)]+)\)|@([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+|[\w\s]{2,30})/g;
    const mentionedUserIds = new Set();

    let match;
    while ((match = mentionRegex.exec(content)) !== null) {
      if (match[2]) {
        // UUID format @[Name](uuid)
        mentionedUserIds.add(match[2]);
      } else if (match[3]) {
        const identifier = match[3].trim();
        // Lookup by email or full_name
        const userRes = await pool.query(
          `SELECT id FROM users WHERE LOWER(email) = LOWER($1) OR LOWER(full_name) = LOWER($1)`,
          [identifier]
        );
        userRes.rows.forEach(u => mentionedUserIds.add(u.id));
      }
    }

    for (const userId of mentionedUserIds) {
      if (userId === authorId) continue; // Don't notify self
      const message = `${authorName} mentioned you in a comment on "${docTitle}"`;
      await pool.query(
        `INSERT INTO notifications (user_id, document_id, message) VALUES ($1, $2, $3)`,
        [userId, docId, message]
      );
    }
  } catch (err) {
    console.error('Error processing mentions:', err);
  }
}

// GET /api/documents/:docId/comments
async function getComments(req, res) {
  const { docId } = req.params;
  const { versionId } = req.query;

  try {
    const docRes = await pool.query(
      `SELECT id, current_version_id FROM documents WHERE id = $1`,
      [docId]
    );
    if (docRes.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const currentVerId = versionId || docRes.rows[0].current_version_id;

    // Fetch all non-deleted comments for this document joined with version numbers
    const result = await pool.query(
      `SELECT c.*, v.version_number, u.full_name as author_full_name, u.email as author_email
       FROM comments c
       JOIN versions v ON v.id = c.version_id
       LEFT JOIN users u ON u.id = c.user_id
       WHERE c.document_id = $1 AND c.is_deleted = FALSE
       ORDER BY c.created_at ASC`,
      [docId]
    );

    const allComments = result.rows.map(row => ({
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
      content: row.content,
      parentCommentId: row.parent_comment_id,
      isResolved: row.is_resolved,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      isEdited: new Date(row.updated_at).getTime() - new Date(row.created_at).getTime() > 1000,
    }));

    // Split active version comments vs previous version comments
    const activeComments = allComments.filter(c => c.versionId === currentVerId);
    const previousComments = allComments.filter(c => c.versionId !== currentVerId);

    // Group into threads (top level + replies)
    function buildThreads(list) {
      const topLevel = list.filter(c => !c.parentCommentId);
      const replies = list.filter(c => c.parentCommentId);

      return topLevel.map(parent => ({
        ...parent,
        replies: replies.filter(r => r.parentCommentId === parent.id),
      }));
    }

    res.json({
      activeThreads: buildThreads(activeComments),
      previousThreads: buildThreads(previousComments),
      totalCount: allComments.length,
    });
  } catch (err) {
    console.error('Error getting comments:', err);
    res.status(500).json({ error: 'Failed to retrieve comments' });
  }
}

// POST /api/documents/:docId/comments
async function createComment(req, res) {
  const { docId } = req.params;
  const {
    pageNumber,
    x,
    y,
    width,
    height,
    content,
    parentCommentId,
    versionId,
    guestName,
  } = req.body;

  if (!content || !content.trim()) {
    return res.status(400).json({ error: 'Comment content cannot be empty' });
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
      : (guestName || 'Viewer');

    // Insert comment
    const insertRes = await pool.query(
      `INSERT INTO comments
        (document_id, version_id, user_id, author_name, page_number, x, y, width, height, content, parent_comment_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
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
        content.trim(),
        parentCommentId || null,
      ]
    );

    const newComment = insertRes.rows[0];

    // Fetch version number for response
    const verRes = await pool.query(`SELECT version_number FROM versions WHERE id = $1`, [targetVersionId]);
    const versionNumber = verRes.rows[0]?.version_number || 1;

    const formattedComment = {
      id: newComment.id,
      documentId: newComment.document_id,
      versionId: newComment.version_id,
      versionNumber,
      userId: newComment.user_id,
      authorName: newComment.author_name,
      pageNumber: newComment.page_number,
      x: parseFloat(newComment.x),
      y: parseFloat(newComment.y),
      width: parseFloat(newComment.width),
      height: parseFloat(newComment.height),
      content: newComment.content,
      parentCommentId: newComment.parent_comment_id,
      isResolved: newComment.is_resolved,
      createdAt: newComment.created_at,
      updatedAt: newComment.updated_at,
      replies: [],
    };

    // 1. Process @mentions
    await processMentions(docId, doc.title, authorName, authorId, content);

    // 2. Notifications for replies or top-level comments
    if (parentCommentId) {
      // Reply notification to parent comment author & participants
      const threadRes = await pool.query(
        `SELECT DISTINCT user_id FROM comments 
         WHERE (id = $1 OR parent_comment_id = $1) AND user_id IS NOT NULL`,
        [parentCommentId]
      );
      for (const row of threadRes.rows) {
        if (row.user_id !== authorId) {
          await pool.query(
            `INSERT INTO notifications (user_id, document_id, message) VALUES ($1, $2, $3)`,
            [row.user_id, docId, `${authorName} replied to a comment thread on "${doc.title}"`]
          );
        }
      }
    } else {
      // Top level comment: Notify document owner if author is someone else
      if (doc.owner_id !== authorId) {
        await pool.query(
          `INSERT INTO notifications (user_id, document_id, message) VALUES ($1, $2, $3)`,
          [doc.owner_id, docId, `${authorName} added a comment on your document "${doc.title}"`]
        );
      }
    }

    // Broadcast real-time Socket.IO event to document room
    emitDocUpdated(docId, {
      type: 'comment:added',
      comment: formattedComment,
    });

    logAudit(req, docId, 'add_comment', { commentId: newComment.id, pageNumber: newComment.page_number }).catch(console.error);

    res.status(201).json(formattedComment);
  } catch (err) {
    console.error('Error creating comment:', err);
    res.status(500).json({ error: 'Failed to post comment' });
  }
}

// PATCH /api/comments/:commentId
async function editComment(req, res) {
  const { commentId } = req.params;
  const { content } = req.body;

  if (!content || !content.trim()) {
    return res.status(400).json({ error: 'Comment content cannot be empty' });
  }

  try {
    const commentRes = await pool.query(`SELECT * FROM comments WHERE id = $1 AND is_deleted = FALSE`, [commentId]);
    if (commentRes.rows.length === 0) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    const comment = commentRes.rows[0];

    // Check ownership of comment
    if (comment.user_id && req.user && comment.user_id !== req.user.id) {
      return res.status(403).json({ error: 'You can only edit your own comments' });
    }

    // Check 15-minute edit window constraint
    const createdTime = new Date(comment.created_at).getTime();
    const nowTime = Date.now();
    const diffMinutes = (nowTime - createdTime) / (1000 * 60);

    if (diffMinutes > 15) {
      return res.status(400).json({ error: 'Comments can only be edited within 15 minutes of posting' });
    }

    const updateRes = await pool.query(
      `UPDATE comments SET content = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [content.trim(), commentId]
    );

    const updated = updateRes.rows[0];

    emitDocUpdated(comment.document_id, {
      type: 'comment:updated',
      comment: {
        id: updated.id,
        content: updated.content,
        updatedAt: updated.updated_at,
        isEdited: true,
      },
    });

    res.json({
      id: updated.id,
      content: updated.content,
      updatedAt: updated.updated_at,
      isEdited: true,
    });
  } catch (err) {
    console.error('Error editing comment:', err);
    res.status(500).json({ error: 'Failed to edit comment' });
  }
}

// DELETE /api/comments/:commentId
async function deleteComment(req, res) {
  const { commentId } = req.params;

  try {
    const commentRes = await pool.query(
      `SELECT c.*, d.owner_id 
       FROM comments c 
       JOIN documents d ON d.id = c.document_id 
       WHERE c.id = $1 AND c.is_deleted = FALSE`,
      [commentId]
    );

    if (commentRes.rows.length === 0) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    const comment = commentRes.rows[0];

    // Author or Document Owner can delete
    const isAuthor = req.user && comment.user_id === req.user.id;
    const isOwner = req.user && comment.owner_id === req.user.id;

    if (!isAuthor && !isOwner) {
      return res.status(403).json({ error: 'Permission denied to delete this comment' });
    }

    // Soft delete top-level comment and its replies
    await pool.query(
      `UPDATE comments SET is_deleted = TRUE, updated_at = NOW() 
       WHERE id = $1 OR parent_comment_id = $1`,
      [commentId]
    );

    logAudit(req, comment.document_id, 'delete_comment', { commentId }).catch(console.error);

    emitDocUpdated(comment.document_id, {
      type: 'comment:deleted',
      commentId,
    });

    res.json({ message: 'Comment deleted successfully', commentId });
  } catch (err) {
    console.error('Error deleting comment:', err);
    res.status(500).json({ error: 'Failed to delete comment' });
  }
}

// POST /api/comments/:commentId/resolve
async function resolveComment(req, res) {
  const { commentId } = req.params;

  try {
    const commentRes = await pool.query(
      `SELECT c.*, d.owner_id 
       FROM comments c 
       JOIN documents d ON d.id = c.document_id 
       WHERE c.id = $1 AND c.is_deleted = FALSE`,
      [commentId]
    );

    if (commentRes.rows.length === 0) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    const comment = commentRes.rows[0];

    // Must be document owner or original commenter
    const isAuthor = req.user && comment.user_id === req.user.id;
    const isOwner = req.user && comment.owner_id === req.user.id;

    if (!isAuthor && !isOwner) {
      return res.status(403).json({ error: 'Only the author or document owner can resolve this comment' });
    }

    const newResolvedState = !comment.is_resolved;

    await pool.query(
      `UPDATE comments SET is_resolved = $1, updated_at = NOW() WHERE id = $2 OR parent_comment_id = $2`,
      [newResolvedState, commentId]
    );

    emitDocUpdated(comment.document_id, {
      type: 'comment:resolved',
      commentId,
      isResolved: newResolvedState,
    });

    res.json({ commentId, isResolved: newResolvedState });
  } catch (err) {
    console.error('Error resolving comment:', err);
    res.status(500).json({ error: 'Failed to resolve comment' });
  }
}

// GET /api/documents/:docId/users-for-mention
async function getUsersForMention(req, res) {
  const { docId } = req.params;

  try {
    // Collect document owner, recipients of private share links, and org members
    const result = await pool.query(
      `SELECT DISTINCT u.id, u.full_name, u.email
       FROM users u
       WHERE u.id IN (
         SELECT owner_id FROM documents WHERE id = $1
         UNION
         SELECT u2.id FROM share_link_recipients slr
         JOIN share_links sl ON sl.id = slr.share_link_id
         JOIN users u2 ON LOWER(u2.email) = LOWER(slr.email)
         WHERE sl.document_id = $1
         UNION
         SELECT om.user_id FROM organisation_documents od
         JOIN organisation_members om ON om.organisation_id = od.organisation_id
         WHERE od.document_id = $1
       )
       ORDER BY u.full_name ASC`,
      [docId]
    );

    res.json(result.rows.map(u => ({
      id: u.id,
      fullName: u.full_name,
      email: u.email,
    })));
  } catch (err) {
    console.error('Error getting users for mention:', err);
    res.status(500).json({ error: 'Failed to load mention candidates' });
  }
}

// GET /api/documents/:docId/comments/export
async function exportCommentsPdf(req, res) {
  const { docId } = req.params;

  try {
    // 1. Fetch document and comments data
    const docRes = await pool.query(`SELECT title, approval_status FROM documents WHERE id = $1`, [docId]);
    if (docRes.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }
    const doc = docRes.rows[0];

    const commentsRes = await pool.query(
      `SELECT c.*, v.version_number, u.full_name as author_full_name
       FROM comments c
       JOIN versions v ON v.id = c.version_id
       LEFT JOIN users u ON u.id = c.user_id
       WHERE c.document_id = $1 AND c.is_deleted = FALSE
       ORDER BY c.page_number ASC, c.created_at ASC`,
      [docId]
    );

    const approvalsRes = await pool.query(
      `SELECT da.*, u.full_name as reviewer_name, u.email as reviewer_email
       FROM document_approvals da
       JOIN users u ON u.id = da.reviewer_id
       WHERE da.document_id = $1
       ORDER BY da.round DESC, da.created_at ASC`,
      [docId]
    );

    const exportPayload = {
      docId,
      title: doc.title,
      approvalStatus: doc.approval_status || 'Draft',
      comments: commentsRes.rows.map(r => ({
        id: r.id,
        versionNumber: r.version_number,
        authorName: r.author_full_name || r.author_name || 'Anonymous',
        pageNumber: r.page_number,
        x: parseFloat(r.x),
        y: parseFloat(r.y),
        content: r.content,
        parentCommentId: r.parent_comment_id,
        isResolved: r.is_resolved,
        createdAt: r.created_at,
      })),
      approvals: approvalsRes.rows.map(r => ({
        reviewerName: r.reviewer_name,
        reviewerEmail: r.reviewer_email,
        status: r.status,
        feedback: r.feedback,
        round: r.round,
        updatedAt: r.updated_at,
      })),
    };

    // Forward to Python microservice
    const pythonUrl = (process.env.PYTHON_SERVICE_URL || 'http://localhost:8001') + '/export-comments';
    
    // Fallback: If python microservice is unavailable, return JSON report
    const axios = require('axios').default || require('axios');
    try {
      const pyResponse = await axios.post(pythonUrl, exportPayload, { responseType: 'arraybuffer' });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="livepdf-comments-${docId}.pdf"`);
      return res.send(Buffer.from(pyResponse.data));
    } catch (pyErr) {
      console.warn('Python export service failed/unavailable, sending JSON export fallback:', pyErr.message);
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="livepdf-comments-${docId}.json"`);
      return res.json(exportPayload);
    }
  } catch (err) {
    console.error('Error exporting comments:', err);
    res.status(500).json({ error: 'Failed to generate comment report' });
  }
}

module.exports = {
  getComments,
  createComment,
  editComment,
  deleteComment,
  resolveComment,
  getUsersForMention,
  exportCommentsPdf,
};
