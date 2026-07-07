const pool = require('../config/db');

async function checkPlanLimits(req, res, next) {
  const userId = req.user.id;

  try {
    const userRes = await pool.query('SELECT plan FROM users WHERE id = $1', [userId]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    req.userPlan = userRes.rows[0].plan || 'FREE';
    next();
  } catch (err) {
    console.error('Error fetching plan limits:', err);
    res.status(500).json({ error: 'Failed to verify billing limits' });
  }
}

function restrictToPlan(allowedPlans) {
  return (req, res, next) => {
    // If it's a verification request on JWT auth payload
    const currentPlan = req.userPlan || req.user.plan || 'FREE';
    if (!allowedPlans.includes(currentPlan)) {
      return res.status(403).json({
        error: `This action requires a ${allowedPlans.join(' or ')} plan. Please upgrade your subscription.`,
      });
    }
    next();
  };
}

async function enforceDocumentLimit(req, res, next) {
  const currentPlan = req.userPlan || req.user.plan || 'FREE';
  if (currentPlan === 'FREE') {
    try {
      const docCountRes = await pool.query('SELECT COUNT(*) FROM documents WHERE owner_id = $1', [req.user.id]);
      const count = parseInt(docCountRes.rows[0].count);
      if (count >= 3) {
        return res.status(403).json({
          error: 'Free tier limits reached (Max 3 documents). Please upgrade to Pro or Enterprise for unlimited files.',
        });
      }
    } catch (err) {
      console.error('Error checking document limit:', err);
      return res.status(500).json({ error: 'Failed to check document constraints' });
    }
  }
  next();
}

async function enforceVersionLimit(req, res, next) {
  const currentPlan = req.userPlan || req.user.plan || 'FREE';
  if (currentPlan === 'FREE') {
    const { id } = req.params;
    try {
      const versionCountRes = await pool.query('SELECT COUNT(*) FROM versions WHERE document_id = $1', [id]);
      const count = parseInt(versionCountRes.rows[0].count);
      if (count >= 5) {
        return res.status(403).json({
          error: 'Free tier limits reached (Max 5 versions per document). Please upgrade to Pro or Enterprise for unlimited version history.',
        });
      }
    } catch (err) {
      console.error('Error checking version limit:', err);
      return res.status(500).json({ error: 'Failed to check version constraints' });
    }
  }
  next();
}

module.exports = { checkPlanLimits, restrictToPlan, enforceDocumentLimit, enforceVersionLimit };

