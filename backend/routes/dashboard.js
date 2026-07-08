// routes/dashboard.js
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { auth } = require('../middleware/auth');
const { PLAN_LIMITS, getOrCreateUsage } = require('../middleware/subscription');

const router = express.Router();
const prisma = new PrismaClient();

router.get('/', auth, async (req, res) => {
  try {
    const uid = req.user.id;

    // All independent queries run in parallel — matches the original's
    // sequential synchronous reads but without the serial blocking
    const [
      total_jobs,
      total_applications,
      sent,
      interview,
      rawRecentApplications,
      recent_jobs,
      usage,
    ] = await Promise.all([
      prisma.job.count({
        where: { is_active: true },
      }),
      prisma.application.count({
        where: { user_id: uid },
      }),
      prisma.application.count({
        where: { user_id: uid, status: 'sent' },
      }),
      prisma.application.count({
        where: { user_id: uid, status: 'interview' },
      }),
      prisma.application.findMany({
        where: { user_id: uid },
        include: {
          job: {
            select: { title: true, company: true, location: true },
          },
        },
        orderBy: { created_at: 'desc' },
        take: 5,
      }),
      prisma.job.findMany({
        where: { is_active: true },
        orderBy: { created_at: 'desc' },
        take: 5,
      }),
      // NOTE: getOrCreateUsage must also be updated to accept a Prisma
      // client instead of a better-sqlite3 db instance
      getOrCreateUsage(prisma, uid),
    ]);

    // Flatten the Prisma nested relation to mirror the original
    // SELECT a.*, j.title AS job_title, j.company, j.location JOIN shape
    const recent_applications = rawRecentApplications.map(({ job, ...app }) => ({
      ...app,
      job_title: job.title,
      company:   job.company,
      location:  job.location,
    }));

    const limits = PLAN_LIMITS[req.user.plan] || PLAN_LIMITS.free;

    res.json({
      stats: { total_jobs, total_applications, sent, interview },
      recent_applications,
      recent_jobs,
      usage: { ...usage, limits },
      plan:                req.user.plan,
      subscription_status: req.user.subscription_status,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Failed to load dashboard' });
  }
});

module.exports = router;