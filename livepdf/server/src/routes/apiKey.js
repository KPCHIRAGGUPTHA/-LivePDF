const router = require('express').Router();
const auth = require('../middleware/auth');
const { checkPlanLimits, restrictToPlan } = require('../middleware/planEnforcer');
const ctrl = require('../controllers/apiKeyController');

// All API key management routes require standard user login
router.use(auth);
router.use(checkPlanLimits);

// Restrict API keys feature to PRO or ENTERPRISE subscription tiers
router.get('/', restrictToPlan(['PRO', 'ENTERPRISE']), ctrl.listApiKeys);
router.post('/', restrictToPlan(['PRO', 'ENTERPRISE']), ctrl.generateApiKey);
router.delete('/:id', restrictToPlan(['PRO', 'ENTERPRISE']), ctrl.revokeApiKey);

module.exports = router;
