const router = require('express').Router();
const auth = require('../middleware/auth');
const { checkPlanLimits, restrictToPlan } = require('../middleware/planEnforcer');
const ctrl = require('../controllers/organisationController');

// All organisation routes require login
router.use(auth);

// Restrict creation of organisations to Enterprise tier
router.get('/', ctrl.listOrganisations);
router.post('/', checkPlanLimits, restrictToPlan(['ENTERPRISE']), ctrl.createOrganisation);

// Invites and member listings
router.post('/:orgId/invite', ctrl.inviteMember);
router.get('/:orgId/members', ctrl.listMembers);
router.patch('/:orgId/members/:userId', ctrl.updateMemberRole);
router.delete('/:orgId/members/:userId', ctrl.removeMember);

module.exports = router;
