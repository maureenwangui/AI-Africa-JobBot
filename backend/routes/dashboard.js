// routes/dashboard.js
// Fixed: uses shared prisma singleton
// Fixed: status: 'ACTIVE' not isActive: true (Job schema uses JobStatus enum)
// Fixed: company is a Company relation — select company.name
// Fixed: application status enum is uppercase (APPLIED not sent)
const express  = require('express');
const prisma   = require('../confiq/prisma');
const { auth } = require('../middleware/auth');
const { PLAN_LIMITS } = require('../middleware/subscription');

const router = express.Router();

const planKey = (plan) => {
  const m = { FREE: 'free', STARTER: 'starter', GROWTH: 'growth', PRO: 'pro', PROFESSIONAL: 'growth', BUSINESS: 'pro' };
  return m[plan?.toUpperCase()] || 'free';
};

router.get('/', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const month  = new Date().toISOString().slice(0, 7);

    const [totalJobs, totalApplications, sent, interview, recentApplications, recentJobs, usage] = await Promise.all([
      prisma.job.count({ where: { status: 'ACTIVE' } }),
      prisma.application.count({ where: { userId } }),
      prisma.application.count({ where: { userId, status: 'APPLIED' } }),
      prisma.application.count({ where: { userId, status: 'INTERVIEW' } }),
      prisma.application.findMany({
        where:   { userId },
        orderBy: { createdAt: 'desc' },
        take:    5,
        include: { job: { select: { title: true, location: true, company: { select: { name: true } } } } },
      }),
      prisma.job.findMany({
        where:   { status: 'ACTIVE' },
        orderBy: { createdAt: 'desc' },
        take:    5,
        include: { company: { select: { name: true } } },
      }),
      prisma.usage.findUnique({ where: { userId_month: { userId, month } } }),
    ]);

    const key    = planKey(req.user._plan || req.user.plan);
    const limits = PLAN_LIMITS[key] || PLAN_LIMITS.free;

    res.json({
      stats: { total_jobs: totalJobs, total_applications: totalApplications, sent, interview },
      recent_applications: recentApplications.map(a => ({
        id:          a.id,
        user_id:     a.userId,
        job_id:      a.jobId,
        status:      a.status.toLowerCase(),
        match_score: a.matchScore,
        created_at:  a.createdAt,
        job_title:   a.job?.title          || '',
        company:     a.job?.company?.name  || '',
        location:    a.job?.location       || '',
      })),
      recent_jobs: recentJobs.map(j => ({
        id:         j.id,
        title:      j.title,
        company:    j.company?.name || '',
        location:   j.location || '',
        remote:     j.remoteType === 'REMOTE' ? 1 : 0,
        is_active:  j.status === 'ACTIVE' ? 1 : 0,
        created_at: j.createdAt,
      })),
      usage: {
        applications_used:  usage?.applicationsUsed     || 0,
        cv_used:            usage?.resumesOptimized      || 0,
        cover_letters_used: usage?.coverLettersGenerated || 0,
        limits,
      },
      plan:                req.user.plan,
      subscription_status: req.user.subscription_status,
    });
  } catch (err) {
    console.error('Dashboard error:', err.message);
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
});

module.exports = router;