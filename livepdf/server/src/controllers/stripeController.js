const pool = require('../config/db');

// Attempt to load Stripe; fall back to mock if not configured
let stripe;
const secretKey = process.env.STRIPE_SECRET_KEY;
if (secretKey && secretKey.startsWith('sk_')) {
  stripe = require('stripe')(secretKey);
} else {
  console.log('⚠️ Stripe Secret Key missing or invalid. Running Stripe in Mock Mode.');
}

async function createCheckoutSession(req, res) {
  const { plan } = req.body; // 'PRO' or 'ENTERPRISE'
  const userId = req.user.id;

  if (!['PRO', 'ENTERPRISE'].includes(plan)) {
    return res.status(400).json({ error: 'Invalid plan selected' });
  }

  // If in Mock Mode, return a simulated Checkout Session redirect URL
  if (!stripe) {
    console.log(`[Mock Stripe] Creating checkout session for user ${userId} to plan ${plan}`);
    
    // Simulate updating user subscription to target plan directly
    try {
      await pool.query(
        `UPDATE users 
         SET plan = $1, stripe_customer_id = $2, stripe_subscription_id = $3 
         WHERE id = $4`,
        [plan, `mock_cus_${userId.substring(0,8)}`, `mock_sub_${userId.substring(0,8)}`, userId]
      );
      
      // Redirect back to client dashboard with success
      return res.json({ url: `${process.env.CLIENT_URL || 'http://localhost:5173'}/dashboard?billing=success` });
    } catch (err) {
      console.error('[Mock Stripe] Error updating plan:', err);
      return res.status(500).json({ error: 'Failed to update mock subscription' });
    }
  }

  let priceId = '';
  if (plan === 'PRO') priceId = process.env.STRIPE_PRO_PRICE_ID;
  else if (plan === 'ENTERPRISE') priceId = process.env.STRIPE_ENTERPRISE_PRICE_ID;

  if (!priceId) {
    return res.status(500).json({ error: 'Stripe Price ID configuration missing on server' });
  }

  try {
    const userRes = await pool.query('SELECT email, stripe_customer_id FROM users WHERE id = $1', [userId]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    const user = userRes.rows[0];

    let customerId = user.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({ email: user.email });
      customerId = customer.id;
      await pool.query('UPDATE users SET stripe_customer_id = $1 WHERE id = $2', [customerId, userId]);
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: `${process.env.CLIENT_URL || 'http://localhost:5173'}/dashboard?billing=success`,
      cancel_url: `${process.env.CLIENT_URL || 'http://localhost:5173'}/dashboard?billing=cancel`,
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error('Stripe Session Error:', error);
    res.status(500).json({ error: 'Failed to create Stripe session' });
  }
}

async function handleWebhook(req, res) {
  // If in Mock Mode, return directly
  if (!stripe) {
    return res.json({ received: true, note: 'Mock mode active, webhooks ignored' });
  }

  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  const session = event.data.object;

  try {
    if (event.type === 'checkout.session.completed' || event.type === 'customer.subscription.updated') {
      const customerId = session.customer;
      const subscriptionId = session.subscription || session.id;
      const stripeSubscription = await stripe.subscriptions.retrieve(subscriptionId);
      
      let plan = 'FREE';
      const priceId = stripeSubscription.items.data[0].price.id;
      if (priceId === process.env.STRIPE_PRO_PRICE_ID) plan = 'PRO';
      else if (priceId === process.env.STRIPE_ENTERPRISE_PRICE_ID) plan = 'ENTERPRISE';

      await pool.query(
        `UPDATE users 
         SET stripe_subscription_id = $1, plan = $2 
         WHERE stripe_customer_id = $3`,
        [subscriptionId, plan, customerId]
      );
    }

    if (event.type === 'customer.subscription.deleted') {
      const customerId = session.customer;
      await pool.query(
        `UPDATE users 
         SET stripe_subscription_id = NULL, plan = 'FREE' 
         WHERE stripe_customer_id = $1`,
        [customerId]
      );
    }

    res.json({ received: true });
  } catch (err) {
    console.error('Error handling webhook DB operations:', err);
    res.status(500).json({ error: 'Database update failed inside Stripe webhook' });
  }
}

async function cancelSubscription(req, res) {
  const userId = req.user.id;
  
  try {
    const userRes = await pool.query('SELECT stripe_subscription_id, plan FROM users WHERE id = $1', [userId]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const user = userRes.rows[0];
    if (user.plan === 'FREE' || !user.stripe_subscription_id) {
      return res.status(400).json({ error: 'No active premium subscription found' });
    }

    if (!stripe || user.stripe_subscription_id.startsWith('mock_')) {
      // Mock Cancel
      await pool.query(
        `UPDATE users 
         SET stripe_subscription_id = NULL, plan = 'FREE' 
         WHERE id = $1`,
        [userId]
      );
      return res.json({ success: true, message: 'Subscription canceled (Mock Mode)' });
    }

    // Real Cancel
    await stripe.subscriptions.cancel(user.stripe_subscription_id);
    await pool.query(
      `UPDATE users 
       SET stripe_subscription_id = NULL, plan = 'FREE' 
       WHERE id = $1`,
      [userId]
    );

    res.json({ success: true, message: 'Subscription successfully canceled.' });
  } catch (error) {
    console.error('Cancel Subscription Error:', error);
    res.status(500).json({ error: 'Failed to cancel subscription' });
  }
}

module.exports = { createCheckoutSession, handleWebhook, cancelSubscription };
