const express = require('express');
const router = express.Router({ mergeParams: true });
const approvalController = require('../controllers/approvalController');
const auth = require('../middleware/auth');

router.post('/submit', auth, approvalController.submitForApproval);
router.post('/decision', auth, approvalController.submitDecision);
router.get('/history', auth, approvalController.getApprovalHistory);

module.exports = router;
