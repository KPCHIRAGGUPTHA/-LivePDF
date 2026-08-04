const documentEventManager = require('../documentEventManager');
const { logAudit } = require('../../utils/audit');
const { emailQueue } = require('../queueService');
const { emitDocUpdated } = require('../../socket');
const { getFileUrl } = require('../../utils/fileUrl');
const pool = require('../../config/db');

// 1. Audit Log Observer - Records audit trail entries
documentEventManager.on('document:updated', async (data) => {
  const { req, docId, nextVersion } = data;
  try {
    await logAudit(req, docId, 'upload', { versionNumber: nextVersion });
    console.log(`[Observer] AuditLogObserver: Logged upload for doc ${docId} version ${nextVersion}`);
  } catch (err) {
    console.error('[Observer Error] AuditLogObserver failed:', err.message);
  }
});

// 2. Email Alerts Observer - Enqueues background email notifications job
documentEventManager.on('document:updated', async (data) => {
  const { docId, nextVersion, versionId, userId } = data;
  if (nextVersion <= 1) return; // Only notify for new version updates
  try {
    const job = await emailQueue.add('sendEmailAlerts', {
      documentId: docId,
      versionNumber: nextVersion,
      newVersionId: versionId,
      ownerId: userId
    });
    console.log(`[Observer] EmailAlertsObserver: Enqueued alerts job ${job.id} for doc ${docId} version ${nextVersion}`);
  } catch (err) {
    console.error('[Observer Error] EmailAlertsObserver failed:', err.message);
  }
});

// 3. Socket Notification Observer - Emits fresh download URLs to active live viewers
documentEventManager.on('document:updated', async (data) => {
  const { req, docId, nextVersion, s3Key } = data;
  if (nextVersion <= 1) return; // Only broadcast for replacements
  try {
    const freshSignedUrl = await getFileUrl(s3Key, req);
    emitDocUpdated(docId, {
      versionNumber: nextVersion,
      signedUrl: freshSignedUrl,
      updatedAt: new Date().toISOString(),
    });
    console.log(`[Observer] SocketNotificationObserver: Emitted update for doc ${docId} version ${nextVersion}`);
  } catch (err) {
    console.error('[Observer Error] SocketNotificationObserver failed:', err.message);
  }
});

// 4. Diff Computation Observer - Asynchronously triggers Python microservice comparisons
documentEventManager.on('document:updated', async (data) => {
  const { docId, nextVersion, versionId, s3Key } = data;
  if (nextVersion <= 1) return; // No previous version exists to diff against
  try {
    const prevVersionResult = await pool.query(
      `SELECT id, s3_key FROM versions
       WHERE document_id = $1 AND version_number = $2`,
      [docId, nextVersion - 1]
    );

    if (prevVersionResult.rows.length > 0) {
      const oldVersion = prevVersionResult.rows[0];
      const newVersion = { id: versionId, s3_key: s3Key };

      const { computeAndStoreDiff } = require('../diffService');
      // Trigger execution asynchronously without holding back event loop
      computeAndStoreDiff(docId, oldVersion, newVersion).catch(err => {
        console.error('[Observer Error] Diff computation execution failed:', err.message);
      });
      console.log(`[Observer] DiffComputationObserver: Triggered diff for doc ${docId} version ${nextVersion}`);
    } else {
      console.log(`[Observer] DiffComputationObserver: No previous version to diff for doc ${docId}`);
    }
  } catch (err) {
    console.error('[Observer Error] DiffComputationObserver failed:', err.message);
  }
});

// 5. Embedding Generation Observer - Parses text and stores vector chunks for RAG QA
documentEventManager.on('document:updated', async (data) => {
  const { docId, versionId, fileBuffer } = data;
  let parser;
  try {
    const { storeEmbeddings } = require('../embeddingService');
    const { PDFParse } = require('pdf-parse');

    parser = new PDFParse({ data: fileBuffer });
    const result = await parser.getText();
    
    if (!result || !result.pages) {
      throw new Error('PDF parser returned invalid text/pages result');
    }

    const pageTexts = result.pages.map(p => ({
      pageNumber: p.num - 1, // convert 1-indexed to 0-indexed
      text: (p.text || '').trim(),
    })).filter(p => p.text.length > 0);

    await storeEmbeddings(docId, versionId, pageTexts);
    console.log(`[Observer] EmbeddingGenerationObserver: Generated & stored embeddings for version ${versionId}`);
  } catch (err) {
    console.error('[Observer Error] EmbeddingGenerationObserver failed:', err.message);
  } finally {
    if (parser) {
      try {
        await parser.destroy();
      } catch (e) {
        // ignore destructor error
      }
    }
  }
});

module.exports = {};
