const router = require('express').Router();
const auth = require('../middleware/auth');
const ctrl = require('../controllers/shareController');

// Public — no auth needed (resolver handles its own auth checks internally)
router.get('/:token',         ctrl.resolveToken);
router.get('/:token/latest',  ctrl.getLatestVersion);
router.post('/:token/unlock', ctrl.unlockProtectedLink);
router.post('/:token/download', ctrl.logDownload);

// Owner only — requires JWT
router.post('/documents/:id/share',        auth, ctrl.createShareLink);
router.get('/documents/:id/share-links',   auth, ctrl.listShareLinks);
router.delete('/:linkId',                  auth, ctrl.deleteShareLink);

module.exports = router;
