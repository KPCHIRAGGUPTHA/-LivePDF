const AIEngine = require('./AIEngine');
const pool = require('../../config/db');

const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

class CachingAIEngineDecorator extends AIEngine {
  /**
   * @param {AIEngine} baseEngine - The underlying AI engine (Gemini or Mock)
   */
  constructor(baseEngine) {
    super();
    this.baseEngine = baseEngine;
  }

  async generateChangeSummary(versionDiffId, changes, documentTitle) {
    // 1. Check PostgreSQL database cache first
    try {
      const cached = await pool.query(
        'SELECT summary_text FROM ai_summaries WHERE version_diff_id = $1',
        [versionDiffId]
      );
      if (cached.rows.length > 0) {
        console.log(`[Cache Hit] AI Summary found in database for version_diff_id: ${versionDiffId}`);
        return cached.rows[0].summary_text;
      }
    } catch (dbErr) {
      console.error('[Cache Error] Cache lookup failed in generateChangeSummary:', dbErr.message);
    }

    // 2. Cache miss: Delegate to underlying base engine
    console.log(`[Cache Miss] Querying underlying AI engine for version_diff_id: ${versionDiffId}`);
    const result = await this.baseEngine.generateChangeSummary(versionDiffId, changes, documentTitle);

    let summaryText = '';
    let promptTokens = null;
    let completionTokens = null;

    if (result && typeof result === 'object') {
      summaryText = result.text;
      promptTokens = result.promptTokens;
      completionTokens = result.completionTokens;
    } else {
      summaryText = result || '';
    }

    // 3. Cache the summary result in PostgreSQL for future requests
    if (summaryText && !summaryText.startsWith('Error:')) {
      try {
        await pool.query(
          `INSERT INTO ai_summaries
            (version_diff_id, summary_text, model_used, prompt_tokens, completion_tokens)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (version_diff_id) DO NOTHING`,
          [
            versionDiffId,
            summaryText,
            MODEL,
            promptTokens,
            completionTokens
          ]
        );
        console.log(`[Cache Saved] Successfully stored AI Summary for version_diff_id: ${versionDiffId}`);
      } catch (dbErr) {
        console.error('[Cache Error] Failed to write cache in generateChangeSummary:', dbErr.message);
      }
    }

    return summaryText;
  }

  async classifyChanges(changes) {
    // Risk classifications are dynamic and not cached per version diff ID here
    return this.baseEngine.classifyChanges(changes);
  }
}

module.exports = CachingAIEngineDecorator;
