const router = require('express').Router();
const pool = require('../config/db');
const { answerQuestionStream } = require('../services/qaService');

// POST /api/qa/:token
// Body: { question, conversationHistory }
// Streams the answer as Server-Sent Events
router.post('/:token', async (req, res) => {
  const { token } = req.params;
  const { question, conversationHistory = [] } = req.body;

  if (!question || question.trim().length === 0) {
    return res.status(400).json({ error: 'Question is required' });
  }

  try {
    // Resolve token to document and check owner's plan
    const linkResult = await pool.query(
      `SELECT sl.document_id, d.title, d.current_version_id, u.plan
       FROM share_links sl
       JOIN documents d ON d.id = sl.document_id
       JOIN users u ON u.id = d.owner_id
       WHERE sl.token = $1`,
      [token]
    );

    if (linkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Link not found' });
    }

    const { document_id, title, current_version_id, plan } = linkResult.rows[0];

    // Restrict QA feature to PRO or ENTERPRISE plans
    if (plan === 'FREE') {
      return res.status(403).json({ error: 'AI Q&A is restricted on Free accounts. The document owner must upgrade to a Pro or Enterprise plan.' });
    }


    // Set up Server-Sent Events headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const stream = answerQuestionStream({
      question: question.trim(),
      versionId: current_version_id,
      documentId: document_id,
      documentTitle: title,
      conversationHistory: conversationHistory.slice(-10), // last 10 messages
    });

    for await (const chunk of stream) {
      if (res.writableEnded) break;
      res.write(`data: ${JSON.stringify(chunk)}\n\n`);
    }
  } catch (err) {
    console.error('Q&A streaming error:', err);
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify({ type: 'error', message: 'AI service error' })}\n\n`);
    }
  } finally {
    if (!res.writableEnded) {
      res.end();
    }
  }
});

module.exports = router;
