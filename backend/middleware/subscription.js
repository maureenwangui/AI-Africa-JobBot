// middleware/subscription.js
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// ─── Plan limits ──────────────────────────────────────────────────────────────
const PLAN_LIMITS = {
  free:    { applications: 3,   cv: 1,  cover_letters: 3   },
  starter: { applications: 20,  cv: 5,  cover_letters: 20  },
  growth:  { applications: 80,  cv: 20, cover_letters: 80  },
  pro:     { applications: 200, cv: 50, cover_letters: 200 },
};

// ─── Get or create usage record for current month ────────────────────────────
// NOTE: requires @@unique([user_id, month]) on UsageLimit in your Prisma schema
// so the upsert where clause is atomic and race-condition safe.
async function getOrCreateUsage(prismaClient, userId) {
  const month = new Date().toISOString().slice(0, 7); // YYYY-MM
  return prismaClient.usageLimit.upsert({
    where:  { user_id_month: { user_id: userId, month } },
    update: {},
    create: { user_id: userId, month, applications_used: 0, cv_used: 0, cover_letters_used: 0 },
  });
}

// ─── Validate active subscription ─────────────────────────────────────────────
const checkSubscription = async (req, res, next) => {
  try {
    const user = req.user;

    // Free plan users allowed (with limits)
    if (user.plan === 'free') return next();

    // Check active subscription
    const sub = await prisma.subscription.findFirst({
      where:   { user_id: user.id, status: 'active' },
      orderBy: { created_at: 'desc' },
    });

    if (!sub) {
      return res.status(403).json({
        error: 'No active subscription. Please subscribe to continue.',
        code:  'NO_SUBSCRIPTION',
      });
    }

    // Check expiry — mark both tables atomically if expired
    if (sub.end_date && new Date(sub.end_date) < new Date()) {
      await prisma.$transaction([
        prisma.subscription.update({
          where: { id: sub.id },
          data:  { status: 'expired' },
        }),
        prisma.user.update({
          where: { id: user.id },
          data:  { subscription_status: 'inactive' },
        }),
      ]);
      return res.status(403).json({
        error: 'Subscription expired. Please renew to continue.',
        code:  'SUBSCRIPTION_EXPIRED',
      });
    }

    req.subscription = sub;
    next();
  } catch (err) {
    console.error('checkSubscription error:', err.message);
    res.status(500).json({ error: 'Subscription check failed' });
  }
};

// ─── Check usage limits before AI actions ────────────────────────────────────
const usageLimitMiddleware = (action) => async (req, res, next) => {
  try {
    const plan   = req.user.plan || 'free';
    const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.free;
    const usage  = await getOrCreateUsage(prisma, req.user.id);

    const limitMap = {
      applications:  { used: usage.applications_used,  limit: limits.applications  },
      cv:            { used: usage.cv_used,             limit: limits.cv            },
      cover_letters: { used: usage.cover_letters_used,  limit: limits.cover_letters },
    };

    const check = limitMap[action];
    if (!check) return next();

    if (check.used >= check.limit) {
      return res.status(429).json({
        error:  'Monthly usage limit reached. Upgrade your plan.',
        code:   'USAGE_LIMIT_REACHED',
        used:   check.used,
        limit:  check.limit,
        plan,
      });
    }

    req.usage      = usage;
    req.planLimits = limits;
    next();
  } catch (err) {
    console.error('usageLimitMiddleware error:', err.message);
    res.status(500).json({ error: 'Usage check failed' });
  }
};

// ─── Deduct usage after a successful action ───────────────────────────────────
// Uses Prisma's atomic { increment: 1 } — race-condition safe, no raw SQL needed
async function deductUsage(userId, action) {
  const month  = new Date().toISOString().slice(0, 7);
  const colMap = {
    applications:  'applications_used',
    cv:            'cv_used',
    cover_letters: 'cover_letters_used',
  };
  const col = colMap[action];
  if (!col) return;

  await prisma.usageLimit.updateMany({
    where: { user_id: userId, month },
    data:  { [col]: { increment: 1 }, updated_at: new Date() },
  });
}

module.exports = { checkSubscription, usageLimitMiddleware, deductUsage, PLAN_LIMITS, getOrCreateUsage };