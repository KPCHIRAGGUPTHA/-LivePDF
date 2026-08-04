const { GoogleGenAI } = require('@google/genai');
const AIEngine = require('./AIEngine');

const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

class GeminiAIEngine extends AIEngine {
  constructor() {
    super();
    const apiKey = process.env.GEMINI_API_KEY;
    this.ai = new GoogleGenAI({ apiKey });
  }

  /**
   * Helper to format changes list into text lines for the prompt context.
   */
  _buildSummaryPrompt(changes, documentTitle) {
    const changeLines = changes
      .slice(0, 50) // Cap at 50 changes to avoid token overflow
      .map((c, i) => {
        const type = c.type;
        const page = c.page + 1;
        const importance = c.importance || 'Low';
        const old = c.old_text ? `"${c.old_text.slice(0, 200)}"` : 'N/A';
        const nw = c.new_text ? `"${c.new_text.slice(0, 200)}"` : 'N/A';
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

  async generateChangeSummary(versionDiffId, changes, documentTitle) {
    if (!changes || changes.length === 0) {
      return { text: 'No changes detected between these versions.', promptTokens: null, completionTokens: null };
    }

    try {
      const prompt = this._buildSummaryPrompt(changes, documentTitle);

      const response = await this.ai.models.generateContent({
        model: MODEL,
        contents: prompt,
      });

      return {
        text: response.text.trim(),
        promptTokens: response.usageMetadata?.promptTokenCount || null,
        completionTokens: response.usageMetadata?.candidatesTokenCount || null
      };
    } catch (err) {
      console.error('Gemini generateChangeSummary failed:', err.message);
      return {
        text: 'Error: Failed to generate AI summary. Please check API configuration or retry later.',
        promptTokens: null,
        completionTokens: null
      };
    }
  }

  _buildRiskPrompt(changes) {
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

  async classifyChanges(changes) {
    if (!changes || changes.length === 0) return changes;

    try {
      const prompt = this._buildRiskPrompt(changes);

      const response = await this.ai.models.generateContent({
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
      console.error('Gemini classifyChanges failed:', err.message);
      // Fallback: Default risk assessment
      return changes.map(c => ({
        ...c,
        importance_reason: c.importance_reason || `Default risk assessment: ${c.importance || 'Low'} importance.`
      }));
    }
  }
}

module.exports = GeminiAIEngine;
