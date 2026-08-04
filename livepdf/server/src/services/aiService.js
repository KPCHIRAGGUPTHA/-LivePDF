const AIEngineFactory = require('./ai/AIEngineFactory');

// Create the unified, decorated AI engine instance using the Factory Method
const aiEngine = AIEngineFactory.getEngine();

/**
 * Generates a summary of changes. Integrates caching via the CachingAIEngineDecorator.
 */
async function generateChangeSummary(versionDiffId, changes, documentTitle) {
  return aiEngine.generateChangeSummary(versionDiffId, changes, documentTitle);
}

/**
 * Classifies document risks dynamically using the AI Engine.
 */
async function classifyChanges(changes) {
  return aiEngine.classifyChanges(changes);
}

module.exports = { generateChangeSummary, classifyChanges };
