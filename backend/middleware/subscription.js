// middleware/subscription.js

const prisma = require('../confiq/prisma');

// ─── Plan limits ──────────────────────────────────────────────────────────────
// Keys must match the SubscriptionPlan enum values exactly (User.plan).
const PLAN_LIMITS = {
  FREE:         { applications: 3,   cv: 1,  cover_letters: 3   },
  STARTER:      { applications: 20,  cv: 5,  cover_letters: 20  },
  PROFESSIONAL: { applications: 80,  cv: 20, cover_letters: 80  },
  BUSINESS:     { applications: 200, cv: 50, cover_letters: 200 },
};

// ─── Get or create usage record for current month ────────────────────────────
// Uses the `Usage` model and its @@unique([userId, month]) constraint
// (Prisma compound-key name: userId_month), so the upsert is atomic and
// race-condition safe.
async function getOrCreateUsage(prismaClient, userId) {
  const month = new Date().toISOString().slice(0, 7); // YYYY-MM
  return prismaClient.usage.upsert({
    where:  { userId_month: { userId, month } },
    update: {},
    create: { userId, month, applicationsUsed: 0, resumesOptimized: 0, coverLettersGenerated: 0 },
  });
}

// ─── Validate active subscription ─────────────────────────────────────────────
const checkSubscription = async (req, res, next) => {
  try {
    const user = req.user;

    // Free plan users allowed (with limits)
    if (user.plan === 'FREE') return next();

    // Check active subscription
    const sub = await prisma.subscription.findFirst({
      where:   { userId: user.id, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
    });

    if (!sub) {
      return res.status(403).json({
        error: 'No active subscription. Please subscribe to continue.',
        code:  'NO_SUBSCRIPTION',
      });
    }

    // Check expiry — mark both tables atomically if expired
    if (sub.endDate && new Date(sub.endDate) < new Date()) {
      await prisma.$transaction([
        prisma.subscription.update({
          where: { id: sub.id },
          data:  { status: 'EXPIRED' },
        }),
        prisma.user.update({
          where: { id: user.id },
          data:  { subscriptionStatus: 'EXPIRED' },
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
    const plan   = req.user.plan || 'FREE';
    const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.FREE;
    const usage  = await getOrCreateUsage(prisma, req.user.id);

    const limitMap = {
      applications:  { used: usage.applicationsUsed,       limit: limits.applications  },
      cv:            { used: usage.resumesOptimized,       limit: limits.cv            },
      cover_letters: { used: usage.coverLettersGenerated,  limit: limits.cover_letters },
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
    applications:  'applicationsUsed',
    cv:            'resumesOptimized',
    cover_letters: 'coverLettersGenerated',
  };
  const col = colMap[action];
  if (!col) return;

  await prisma.usage.updateMany({
    where: { userId, month },
    data:  { [col]: { increment: 1 }, updatedAt: new Date() },
  });
}

module.exports = { checkSubscription, usageLimitMiddleware, deductUsage, PLAN_LIMITS, getOrCreateUsage };