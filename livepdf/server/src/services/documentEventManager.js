const EventEmitter = require('events');

class DocumentEventManager extends EventEmitter {
  constructor() {
    super();
    // Increase listener limits if necessary (since we have 5 observers)
    this.setMaxListeners(20);
  }
}

// Export a singleton instance so all parts of the application share the same bus
const documentEventManager = new DocumentEventManager();

module.exports = documentEventManager;
