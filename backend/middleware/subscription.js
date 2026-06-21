// middleware/subscription.js
const getDb = require('../db/connection');

// Plan limits
const PLAN_LIMITS = {
  free:    { applications: 3,   cv: 1,  cover_letters: 3   },
  starter: { applications: 20,  cv: 5,  cover_letters: 20  },
  growth:  { applications: 80,  cv: 20, cover_letters: 80  },
  pro:     { applications: 200, cv: 50, cover_letters: 200 },
};

// Get or create usage record for current month
function getOrCreateUsage(db, userId) {
  const month = new Date().toISOString().slice(0, 7); // YYYY-MM
  let usage = db.prepare('SELECT * FROM usage_limits WHERE user_id = ? AND month = ?').get(userId, month);
  if (!usage) {
    db.prepare(`
      INSERT INTO usage_limits (user_id, month, applications_used, cv_used, cover_letters_used)
      VALUES (?, ?, 0, 0, 0)
    `).run(userId, month);
    usage = db.prepare('SELECT * FROM usage_limits WHERE user_id = ? AND month = ?').get(userId, month);
  }
  return usage;
}

// Validates that the user has an active subscription
const checkSubscription = (req, res, next) => {
  const db = getDb();
  const user = req.user;

  // Free plan users allowed (with limits)
  if (user.plan === 'free') return next();

  // Check active subscription
  const sub = db.prepare(`
    SELECT * FROM subscriptions
    WHERE user_id = ? AND status = 'active'
    ORDER BY created_at DESC LIMIT 1
  `).get(user.id);

  if (!sub) {
    return res.status(403).json({
      error: 'No active subscription. Please subscribe to continue.',
      code: 'NO_SUBSCRIPTION',
    });
  }

  // Check expiry
  if (sub.end_date && new Date(sub.end_date) < new Date()) {
    // Mark expired
    db.prepare("UPDATE subscriptions SET status = 'expired' WHERE id = ?").run(sub.id);
    db.prepare("UPDATE users SET subscription_status = 'inactive' WHERE id = ?").run(user.id);
    return res.status(403).json({
      error: 'Subscription expired. Please renew to continue.',
      code: 'SUBSCRIPTION_EXPIRED',
    });
  }

  req.subscription = sub;
  next();
};

// Check usage limits before AI actions
const usageLimitMiddleware = (action) => (req, res, next) => {
  const db = getDb();
  const plan = req.user.plan || 'free';
  const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.free;
  const usage = getOrCreateUsage(db, req.user.id);

  const limitMap = {
    applications:  { used: usage.applications_used,  limit: limits.applications  },
    cv:            { used: usage.cv_used,             limit: limits.cv            },
    cover_letters: { used: usage.cover_letters_used,  limit: limits.cover_letters },
  };

  const check = limitMap[action];
  if (!check) return next();

  if (check.used >= check.limit) {
    return res.status(429).json({
      error: 'Monthly usage limit reached. Upgrade your plan.',
      code: 'USAGE_LIMIT_REACHED',
      used: check.used,
      limit: check.limit,
      plan,
    });
  }

  req.usage = usage;
  req.planLimits = limits;
  next();
};

// Deduct usage after a successful action
function deductUsage(userId, action) {
  const db = getDb();
  const month = new Date().toISOString().slice(0, 7);
  const col = { applications: 'applications_used', cv: 'cv_used', cover_letters: 'cover_letters_used' }[action];
  if (!col) return;
  db.prepare(`UPDATE usage_limits SET ${col} = ${col} + 1, updated_at = datetime('now') WHERE user_id = ? AND month = ?`)
    .run(userId, month);
}

module.exports = { checkSubscription, usageLimitMiddleware, deductUsage, PLAN_LIMITS, getOrCreateUsage };