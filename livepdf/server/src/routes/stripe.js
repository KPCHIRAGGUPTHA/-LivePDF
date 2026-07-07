const router = require('express').Router();
const auth = require('../middleware/auth');
const ctrl = require('../controllers/stripeController');
const express = require('express');

// Checkout routes require authentication
router.post('/checkout', auth, ctrl.createCheckoutSession);
router.post('/cancel', auth, ctrl.cancelSubscription);

// Webhook requires raw parser to verify signatures
router.post('/webhook', express.raw({ type: 'application/json' }), ctrl.handleWebhook);

module.exports = router;
