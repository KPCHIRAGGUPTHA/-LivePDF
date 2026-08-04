const AIEngine = require('./AIEngine');

class MockAIEngine extends AIEngine {
  async generateChangeSummary(versionDiffId, changes, documentTitle) {
    if (!changes || changes.length === 0) {
      return { text: 'No changes detected between these versions.', promptTokens: null, completionTokens: null };
    }

    const mockSummary = `[Mock AI Summary] The document "${documentTitle || 'Untitled'}" was updated. Changes include: ` +
      changes.slice(0, 3).map(c => `${c.type} on page ${c.page + 1}`).join(', ') + '.';

    return {
      text: mockSummary,
      promptTokens: 0,
      completionTokens: 0
    };
  }

  async classifyChanges(changes) {
    if (!changes || changes.length === 0) return changes;

    return changes.map((c) => {
      let importance = c.importance || 'Low';
      let reason = 'Rule-based importance score (AI Mock Mode).';
      const textCombined = ((c.old_text || '') + (c.new_text || '')).toLowerCase();
      
      if (
        textCombined.includes('payment') ||
        textCombined.includes('due') ||
        textCombined.includes('terminate') ||
        textCombined.includes('liability')
      ) {
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
}

module.exports = MockAIEngine;
