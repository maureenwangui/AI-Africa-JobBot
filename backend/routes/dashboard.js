// routes/dashboard.js
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { auth } = require('../middleware/auth');
const { PLAN_LIMITS } = require('../middleware/subscription');

const prisma = new PrismaClient();
const router = express.Router();

// The database stores plans as Prisma enums while the existing frontend uses
// the legacy lowercase plan names.
const planLimitKey = {
  FREE: 'free',
  STARTER: 'starter',
  PROFESSIONAL: 'growth',
  BUSINESS: 'pro',
};

router.get('/', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const month = new Date().toISOString().slice(0, 7);

    const [
      totalJobs,
      totalApplications,
      sent,
      interview,
      recentApplications,
      recentJobs,
      usage,
    ] = await Promise.all([
      prisma.job.count({ where: { status: 'ACTIVE' } }),
      prisma.application.count({ where: { userId } }),
      prisma.application.count({ where: { userId, status: 'APPLIED' } }),
      prisma.application.count({ where: { userId, status: 'INTERVIEW' } }),
      prisma.application.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: {
          job: {
            select: {
              title: true,
              location: true,
              company: { select: { name: true } },
            },
          },
        },
      }),
      prisma.job.findMany({
        where: { status: 'ACTIVE' },
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: { company: { select: { name: true } } },
      }),
      prisma.usage.findUnique({ where: { userId_month: { userId, month } } }),
    ]);

    const limitKey = planLimitKey[req.user.plan] || 'free';
    const limits = PLAN_LIMITS[limitKey] || PLAN_LIMITS.free;

    res.json({
      stats: {
        total_jobs: totalJobs,
        total_applications: totalApplications,
        sent,
        interview,
      },
      recent_applications: recentApplications.map((application) => ({
        id: application.id,
        user_id: application.userId,
        job_id: application.jobId,
        status: application.status.toLowerCase(),
        match_score: application.matchScore,
        created_at: application.createdAt,
        updated_at: application.updatedAt,
        job_title: application.job.title,
        company: application.job.company.name,
        location: application.job.location || '',
      })),
      recent_jobs: recentJobs.map((job) => ({
        id: job.id,
        title: job.title,
        company: job.company.name,
        location: job.location || '',
        remote: job.remoteType === 'REMOTE' ? 1 : 0,
        salary: job.salaryMin && job.salaryMax
          ? `${job.currency} ${job.salaryMin} - ${job.salaryMax}`
          : null,
        is_active: job.status === 'ACTIVE' ? 1 : 0,
        created_at: job.createdAt,
      })),
      usage: {
        applications_used: usage?.applicationsUsed || 0,
        cv_used: usage?.resumesOptimized || 0,
        cover_letters_used: usage?.coverLettersGenerated || 0,
        limits,
      },
      plan: limitKey,
      subscription_status: req.user.subscriptionStatus.toLowerCase(),
    });
  } catch (err) {
    console.error('Dashboard error:', err.message);
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
});

module.exports = router;