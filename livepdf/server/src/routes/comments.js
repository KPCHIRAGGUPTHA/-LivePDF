const express = require('express');
const router = express.Router({ mergeParams: true });
const commentsController = require('../controllers/commentsController');
const auth = require('../middleware/auth');
const optionalAuth = require('../middleware/optionalAuth'); // Middleware that decodes JWT if present but doesn't block guests

// Optional auth helper middleware
function softAuth(req, res, next) {
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    return auth(req, res, next);
  }
  req.user = null;
  next();
}

// Comment endpoints
router.get('/', softAuth, commentsController.getComments);
router.post('/', softAuth, commentsController.createComment);
router.patch('/:commentId', auth, commentsController.editComment);
router.delete('/:commentId', auth, commentsController.deleteComment);
router.post('/:commentId/resolve', auth, commentsController.resolveComment);
router.get('/users-for-mention', softAuth, commentsController.getUsersForMention);
router.get('/export', softAuth, commentsController.exportCommentsPdf);

module.exports = router;
