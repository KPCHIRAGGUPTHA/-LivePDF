const { GoogleGenAI } = require('@google/genai');
const pool = require('../config/db');

const apiKey = process.env.GEMINI_API_KEY;
let ai;
if (apiKey && !apiKey.startsWith('your_')) {
  ai = new GoogleGenAI({ apiKey });
} else {
  console.log('⚠️ GEMINI_API_KEY is not set or set to placeholder. Gemini AI features will run in Mock Mode.');
}

const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

// ─── Change Summary ───────────────────────────────────────────

function buildSummaryPrompt(changes, documentTitle) {
  const changeLines = changes
    .slice(0, 50)  // cap at 50 changes to stay within context
    .map((c, i) => {
      const type = c.type;
      const page = c.page + 1;
      const importance = c.importance || 'Low';
      const old = c.old_text ? `"${c.old_text.slice(0, 200)}"` : 'N/A';
      const nw  = c.new_text ? `"${c.new_text.slice(0, 200)}"` : 'N/A';
      return `${i + 1}. [${type}] [${importance}] Page ${page}: ${old} → ${nw}`;
    })
    .join('\n');

  return `You are a document analyst. Below are the changes detected between
two versions of a document titled "${documentTitle || 'Untitled'}".

CHANGES:
${changeLines}

Write a concise plain-English summary (2–5 sentences, under 150 words) of what
changed. Mention page numbers. Highlight Critical and High importance changes
first. Write for a business professional who has not seen the raw diff.
Respond with ONLY the summary paragraph — no preamble, no bullet points.`;
}

async function generateChangeSummary(versionDiffId, changes, documentTitle) {
  // Check cache first
  try {
    const cached = await pool.query(
      'SELECT summary_text FROM ai_summaries WHERE version_diff_id = $1',
      [versionDiffId]
    );
    if (cached.rows.length > 0) {
      return cached.rows[0].summary_text;
    }
  } catch (dbErr) {
    console.error('Cache lookup failed in generateChangeSummary:', dbErr.message);
  }

  if (!changes || changes.length === 0) {
    return 'No changes detected between these versions.';
  }

  if (!ai) {
    // Mock Mode fallback
    const mockSummary = `[Mock AI Summary] The document "${documentTitle || 'Untitled'}" was updated. Changes include: ` +
      changes.slice(0, 3).map(c => `${c.type} on page ${c.page + 1}`).join(', ') + '.';
    return mockSummary;
  }

  try {
    const prompt = buildSummaryPrompt(changes, documentTitle);

    const response = await ai.models.generateContent({
      model: MODEL,
      contents: prompt,
    });

    const summaryText = response.text.trim();

    // Cache the result
    await pool.query(
      `INSERT INTO ai_summaries
        (version_diff_id, summary_text, model_used, prompt_tokens, completion_tokens)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (version_diff_id) DO NOTHING`,
      [
        versionDiffId,
        summaryText,
        MODEL,
        response.usageMetadata?.promptTokenCount || null,
        response.usageMetadata?.candidatesTokenCount || null,
      ]
    );

    return summaryText;
  } catch (err) {
    console.error('generateChangeSummary API call failed:', err.message);
    return 'Error: Failed to generate AI summary. Please check API configuration or retry later.';
  }
}

// ─── Risk Classification ──────────────────────────────────────

function buildRiskPrompt(changes) {
  const items = changes.map((c, i) => ({
    index: i,
    type: c.type,
    page: c.page + 1,
    old_text: (c.old_text || '').slice(0, 300),
    new_text: (c.new_text || '').slice(0, 300),
  }));

  return `You are a legal and business document risk analyst.
Classify the importance of each document change below.

Rules:
- "Critical": changes to legal terms, payment amounts, deadlines, termination
  clauses, liabilities, penalties, or any change with major business impact
- "High": changes to numbers, dates, percentages, names, or facts that are
  meaningful but not immediately dangerous
- "Low": typo fixes, formatting changes, minor wording adjustments

For each change, respond with ONLY a JSON array. No explanation outside JSON.
Each element: { "index": <number>, "importance": "Low"|"High"|"Critical",
                "reason": "<one sentence why>" }

CHANGES:
${JSON.stringify(items, null, 2)}`;
}

async function classifyChanges(changes) {
  if (!changes || changes.length === 0) return changes;

  if (!ai) {
    // Mock Mode fallback
    return changes.map((c, i) => {
      let importance = c.importance || 'Low';
      let reason = 'Rule-based importance score (AI Mock Mode).';
      const textCombined = ((c.old_text || '') + (c.new_text || '')).toLowerCase();
      
      if (textCombined.includes('payment') || textCombined.includes('due') || textCombined.includes('terminate') || textCombined.includes('liability')) {
        importance = 'Critical';
        reason = '[Mock AI] Change involves potential legal, payment, or deadline terms.';
      } else if (/\b\d+\b/.test(textCombined)) {
        importance = 'High';
        reason = '[Mock AI] Change modifies a numerical value or date.';
      }
      
      return {
        ...c,
        importance,
        importance_reason: reason,
      };
    });
  }

  try {
    const prompt = buildRiskPrompt(changes);

    const response = await ai.models.generateContent({
      model: MODEL,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      },
    });

    const raw = response.text.trim();
    const classifications = JSON.parse(raw);

    // Merge AI classifications back into change objects
    const updated = [...changes];
    for (const cls of classifications) {
      if (updated[cls.index]) {
        updated[cls.index].importance = cls.importance;
        updated[cls.index].importance_reason = cls.reason;
      }
    }
    return updated;

  } catch (err) {
    console.error('Risk classification failed:', err.message);
    // Fallback: rule-based or current importance
    return changes.map(c => ({
      ...c,
      importance_reason: c.importance_reason || `Default risk assessment: ${c.importance || 'Low'} importance.`,
    }));
  }
}

module.exports = { generateChangeSummary, classifyChanges };
