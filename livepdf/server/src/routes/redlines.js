const express = require('express');
const router = express.Router({ mergeParams: true });
const redlineController = require('../controllers/redlineController');
const auth = require('../middleware/auth');

function softAuth(req, res, next) {
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    return auth(req, res, next);
  }
  req.user = null;
  next();
}

// Redline endpoints
router.get('/', softAuth, redlineController.getRedlines);
router.post('/', softAuth, redlineController.createRedline);
router.patch('/:id/decision', auth, redlineController.updateRedlineDecision);
router.post('/apply', auth, redlineController.applyAcceptedRedlines);

module.exports = router;
