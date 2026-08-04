/**
 * Abstract class representing an AI engine interface.
 * Any AI provider (Gemini, Mock, OpenAI, etc.) must implement these methods.
 */
class AIEngine {
  /**
   * Generates a plain-English summary of the changes between document versions.
   * @param {string} versionDiffId - Database ID of the version diff.
   * @param {Array} changes - List of changes detected.
   * @param {string} documentTitle - Title of the document.
   * @returns {Promise<string>} Plain-English summary text.
   */
  async generateChangeSummary(versionDiffId, changes, documentTitle) {
    throw new Error('Method "generateChangeSummary" must be implemented.');
  }

  /**
   * Classifies the importance of document changes (Critical, High, Low) with rationale.
   * @param {Array} changes - List of changes detected.
   * @returns {Promise<Array>} List of changes enriched with importance and importance_reason.
   */
  async classifyChanges(changes) {
    throw new Error('Method "classifyChanges" must be implemented.');
  }
}

module.exports = AIEngine;
