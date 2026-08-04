const GeminiAIEngine = require('./GeminiAIEngine');
const MockAIEngine = require('./MockAIEngine');
const CachingAIEngineDecorator = require('./CachingAIEngineDecorator');

class AIEngineFactory {
  /**
   * Factory method to construct and return a decorated AI Engine.
   * Checks for GEMINI_API_KEY environment variable. If placeholder or missing, defaults to MockAIEngine.
   * @returns {AIEngine} A fully cached AI engine instance.
   */
  static getEngine() {
    const apiKey = process.env.GEMINI_API_KEY;
    const isMockMode = !apiKey || apiKey.startsWith('your_');

    let baseEngine;
    if (isMockMode) {
      baseEngine = new MockAIEngine();
    } else {
      baseEngine = new GeminiAIEngine();
    }

    // Wrap in the CachingDecorator to transparently cache results
    return new CachingAIEngineDecorator(baseEngine);
  }
}

module.exports = AIEngineFactory;
