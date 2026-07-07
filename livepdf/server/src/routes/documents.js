const router = require('express').Router();
const auth = require('../middleware/auth');
const upload = require('../middleware/upload');
const ctrl = require('../controllers/documentController');
const { checkPlanLimits, restrictToPlan, enforceDocumentLimit, enforceVersionLimit } = require('../middleware/planEnforcer');

router.get('/',                    auth, ctrl.listDocuments);
router.post('/upload',             auth, checkPlanLimits, enforceDocumentLimit, upload.single('pdf'), ctrl.uploadDocument);
router.post('/:id/upload-version', auth, checkPlanLimits, enforceVersionLimit, upload.single('pdf'), ctrl.uploadNewVersion);
router.delete('/:id',              auth, ctrl.deleteDocument);
router.get('/:id/signed-url',      auth, ctrl.getSignedUrl);
router.get('/:id/versions',        auth, ctrl.listDocumentVersions);
router.get('/:id/versions/:versionNumber/signed-url', auth, ctrl.getSignedUrlForVersion);
router.get('/:id/diff', auth, checkPlanLimits, restrictToPlan(['PRO', 'ENTERPRISE']), ctrl.getVersionDiff);
router.get('/:id/audit-logs', auth, ctrl.getDocumentAuditLogs);
router.get('/mock-download/:userId/:docId/:filename', ctrl.mockDownload);

module.exports = router;

