const axios = require('axios');
const pool = require('../config/db');
const { emitDocUpdated } = require('../socket');
const { generateChangeSummary, classifyChanges } = require('./aiService');

const DIFF_SERVICE_URL = process.env.DIFF_SERVICE_URL || 'http://localhost:8001';

async function computeAndStoreDiff(documentId, oldVersion, newVersion) {
  try {
    // Call the Python microservice
    const response = await axios.post(`${DIFF_SERVICE_URL}/diff`, {
      old_s3_key: oldVersion.s3_key,
      new_s3_key: newVersion.s3_key,
    }, { timeout: 60000 });  // 60s timeout for large PDFs

    const { changes, total_changes, added_count, removed_count, modified_count } =
      response.data;

    // Store in version_diffs table
    const insertResult = await pool.query(
      `INSERT INTO version_diffs
        (document_id, old_version_id, new_version_id, change_map,
         total_changes, added_count, removed_count, modified_count)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (old_version_id, new_version_id) DO UPDATE
         SET change_map = EXCLUDED.change_map,
             total_changes = EXCLUDED.total_changes,
             computed_at = NOW()
       RETURNING id`,
      [documentId, oldVersion.id, newVersion.id,
       JSON.stringify(changes), total_changes,
       added_count, removed_count, modified_count]
    );

    const diffRowId = insertResult.rows[0].id;

    // Emit diff:ready event to all open viewers of this document
    emitDocUpdated(documentId, {
      type: 'diff:ready',
      changeMap: changes,
      totalChanges: total_changes,
      addedCount: added_count,
      removedCount: removed_count,
      modifiedCount: modified_count,
      oldVersionId: oldVersion.id,
      newVersionId: newVersion.id,
    });

    console.log(`Diff computed for doc ${documentId}: ${total_changes} changes. Starting AI enrichment...`);

    // Run AI classification and summary asynchronously
    ;(async () => {
      try {
        // Get document title
        let documentTitle = '';
        const docRes = await pool.query('SELECT title FROM documents WHERE id = $1', [documentId]);
        if (docRes.rows.length > 0) {
          documentTitle = docRes.rows[0].title;
        }

        // 1. Upgrade importance scores with AI
        const aiClassifiedChanges = await classifyChanges(changes);

        // 2. Update the change_map in the DB with AI classifications
        await pool.query(
          'UPDATE version_diffs SET change_map = $1 WHERE id = $2',
          [JSON.stringify(aiClassifiedChanges), diffRowId]
        );

        // 3. Generate and cache the plain-English summary
        const summary = await generateChangeSummary(diffRowId, aiClassifiedChanges, documentTitle);

        // 4. Emit updated diff with summary to open viewers
        emitDocUpdated(documentId, {
          type: 'diff:updated',
          changeMap: aiClassifiedChanges,
          summary,
        });
        console.log(`AI enrichment completed for version_diff ${diffRowId}`);
      } catch (err) {
        console.error('AI enrichment failed:', err.message);
      }
    })();

  } catch (err) {
    // Diff failure is non-fatal — the document still uploaded successfully
    console.error('Diff computation failed:', err.message);
  }
}


async function getDiff(oldVersionId, newVersionId) {
  const result = await pool.query(
    `SELECT vd.id, vd.change_map, vd.total_changes, vd.added_count, vd.removed_count, vd.modified_count,
            vd.computed_at, s.summary_text AS summary
     FROM version_diffs vd
     LEFT JOIN ai_summaries s ON s.version_diff_id = vd.id
     WHERE vd.old_version_id = $1 AND vd.new_version_id = $2`,
    [oldVersionId, newVersionId]
  );

  return result.rows[0] || null;
}


module.exports = { computeAndStoreDiff, getDiff };
