const router = require('express').Router();
const auth = require('../middleware/auth');
const ctrl = require('../controllers/notificationController');

// Public unsubscribe endpoint (triggered from email link clicks)
router.get('/unsubscribe', ctrl.unsubscribe);

// Authenticated notification routes
router.get('/', auth, ctrl.listNotifications);
router.get('/count', auth, ctrl.getUnreadCount);
router.patch('/read-all', auth, ctrl.readAll);
router.patch('/:id/read', auth, ctrl.readIndividual);
router.get('/preferences', auth, ctrl.getPreferences);
router.patch('/preferences/:documentId', auth, ctrl.togglePreference);

module.exports = router;
