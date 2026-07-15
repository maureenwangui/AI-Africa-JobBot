// middleware/subscription.js
// Fixed: uses shared prisma singleton
// Fixed: prisma.usageLimit → prisma.usage
// Fixed: snake_case → camelCase fields
// Fixed: plan compared as lowercase, status as UPPERCASE enums
const prisma = require('../confiq/prisma');

const PLAN_LIMITS = {
  free:    { applications: 3,   cv: 1,  cover_letters: 3   },
  starter: { applications: 20,  cv: 5,  cover_letters: 20  },
  growth:  { applications: 80,  cv: 20, cover_letters: 80  },
  pro:     { applications: 200, cv: 50, cover_letters: 200 },
};

async function getOrCreateUsage(userId) {
  const month = new Date().toISOString().slice(0, 7);
  return prisma.usage.upsert({
    where:  { userId_month: { userId, month } },
    update: {},
    create: { userId, month, applicationsUsed: 0, resumesOptimized: 0, coverLettersGenerated: 0, aiCreditsUsed: 0 },
  });
}

const checkSubscription = async (req, res, next) => {
  try {
    if (req.user.plan === 'free') return next();

    const sub = await prisma.subscription.findFirst({
      where:   { userId: req.user.id, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
    });

    if (!sub) return res.status(403).json({ error: 'No active subscription.', code: 'NO_SUBSCRIPTION' });

    if (sub.endDate && new Date(sub.endDate) < new Date()) {
      await prisma.$transaction([
        prisma.subscription.update({ where: { id: sub.id }, data: { status: 'EXPIRED' } }),
        prisma.user.update({ where: { id: req.user.id }, data: { subscriptionStatus: 'EXPIRED' } }),
      ]);
      return res.status(403).json({ error: 'Subscription expired.', code: 'SUBSCRIPTION_EXPIRED' });
    }

    req.subscription = sub;
    next();
  } catch (err) {
    console.error('checkSubscription error:', err.message);
    res.status(500).json({ error: 'Subscription check failed' });
  }
};

const usageLimitMiddleware = (action) => async (req, res, next) => {
  try {
    const plan   = req.user.plan || 'free';
    const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.free;
    const usage  = await getOrCreateUsage(req.user.id);

    const limitMap = {
      applications:  { used: usage.applicationsUsed,     limit: limits.applications  },
      cv:            { used: usage.resumesOptimized,      limit: limits.cv            },
      cover_letters: { used: usage.coverLettersGenerated, limit: limits.cover_letters },
    };

    const check = limitMap[action];
    if (!check) return next();

    if (check.used >= check.limit) {
      return res.status(429).json({ error: 'Monthly limit reached. Upgrade your plan.', code: 'USAGE_LIMIT_REACHED', used: check.used, limit: check.limit, plan });
    }

    req.usage      = usage;
    req.planLimits = limits;
    next();
  } catch (err) {
    console.error('usageLimitMiddleware error:', err.message);
    res.status(500).json({ error: 'Usage check failed' });
  }
};

async function deductUsage(userId, action) {
  const month  = new Date().toISOString().slice(0, 7);
  const colMap = {
    applications:  'applicationsUsed',
    cv:            'resumesOptimized',
    cover_letters: 'coverLettersGenerated',
  };
  const col = colMap[action];
  if (!col) return;
  try {
    await prisma.usage.upsert({
      where:  { userId_month: { userId, month } },
      update: { [col]: { increment: 1 } },
      create: { userId, month, applicationsUsed: 0, resumesOptimized: 0, coverLettersGenerated: 0, aiCreditsUsed: 0, [col]: 1 },
    });
  } catch (err) {
    console.error('deductUsage error:', err.message);
  }
}

module.exports = { checkSubscription, usageLimitMiddleware, deductUsage, PLAN_LIMITS, getOrCreateUsage };