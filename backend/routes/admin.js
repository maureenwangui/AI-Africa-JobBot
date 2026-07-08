// routes/admin.js — Complete Admin API
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { adminAuth } = require('../middleware/auth');

const router = express.Router();

// ── GET /api/admin/stats ──────────────────────────────────────────────────────
router.get('/stats', adminAuth, async (req, res) => {
  try {
    const [
      totalUsers,
      activeSubscribers,
      totalApplications,
      totalJobs,
      totalJobsAll,
      subsActive,
      planFree,
      planStarter,
      planGrowth,
      planPro,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({
        where: { subscriptionStatus: 'active' },
      }),
      prisma.application.count(),
      prisma.job.count({
        where: { isActive: true },
      }),
      prisma.job.count(),
      prisma.subscription.count({
        where: { status: 'active' },
      }),
      prisma.user.count({
        where: { plan: 'free' },
      }),
      prisma.user.count({
        where: { plan: 'starter' },
      }),
      prisma.user.count({
        where: { plan: 'growth' },
      }),
      prisma.user.count({
        where: { plan: 'pro' },
      }),
    ]);

    const appsToday = await prisma.application.count({
      where: {
        createdAt: {
          gte: new Date(new Date().setHours(0, 0, 0, 0)),
        },
      },
    });

    const usersToday = await prisma.user.count({
      where: {
        createdAt: {
          gte: new Date(new Date().setHours(0, 0, 0, 0)),
        },
      },
    });

    const mrrKes =
      planStarter * 500 +
      planGrowth * 1200 +
      planPro * 2500;

    res.json({
      total_users: totalUsers,
      active_subscribers: activeSubscribers,
      total_applications: totalApplications,
      total_jobs: totalJobs,
      total_jobs_all: totalJobsAll,
      subs_active: subsActive,
      plan_breakdown: {
        free: planFree,
        starter: planStarter,
        growth: planGrowth,
        pro: planPro,
      },
      mrr_kes: mrrKes,
      apps_today: appsToday,
      users_today: usersToday,
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: 'Failed to load stats',
    });
  }
});
// ── GET /api/admin/users ──────────────────────────────────────────────────────
router.get('/users', adminAuth, async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      include: {
        profile: true,
        applications: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    const formatted = users.map(user => ({
      id: user.id,
      email: user.email,
      name: user.name,
      phone: user.phone,
      plan: user.plan,
      subscriptionStatus: user.subscriptionStatus,
      role: user.role,
      createdAt: user.createdAt,
      app_count: user.applications.length,
      cv_filename: user.profile?.cvFilename,
      skills: user.profile?.skills,
      preferred_location: user.profile?.preferredLocation,
    }));

    res.json(formatted);

  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "Failed to load users",
    });
  }
});

// ── GET /api/admin/applications ───────────────────────────────────────────────
router.get('/applications', adminAuth, async (req, res) => {
  try {
    const apps = await prisma.application.findMany({
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
        job: {
          select: {
            id: true,
            title: true,
            company: true,
            location: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 500,
    });
    res.json(apps);
  } catch (err) {
    console.error('Admin applications error:', err.message);
    res.status(500).json({ error: 'Failed to load applications' });
  }
});


// ── GET /api/admin/jobs ───────────────────────────────────────────────────────
router.get('/jobs', adminAuth, async (req, res) => {
  try {
    const jobs = await prisma.job.findMany({
      include: {
        applications: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 500,
    });

    const formatted = jobs.map(job => ({
      ...job,
      application_count: job.applications.length,
    }));

    res.json(formatted);

  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: 'Failed to load jobs',
    });
  }
});
// ── GET /api/admin/subscriptions ─────────────────────────────────────────────
router.get('/subscriptions', adminAuth, async (req, res) => {
  try {
    const subs = await prisma.subscription.findMany({
      include: {
        user: {
          select: {
            email: true,
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 200,
    });

    res.json(subs);

  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: 'Failed to load subscriptions',
    });
  }
});

// ── PATCH /api/admin/jobs/:id/toggle ─────────────────────────────────────────
router.patch('/jobs/:id/toggle', adminAuth, async (req, res) => {
  try {

    const job = await prisma.job.findUnique({
      where: {
        id: Number(req.params.id),
      },
    });

    if (!job) {
      return res.status(404).json({
        error: 'Job not found',
      });
    }

    const updated = await prisma.job.update({
      where: {
        id: Number(req.params.id),
      },
      data: {
        isActive: !job.isActive,
      },
    });

    res.json({
      message: updated.isActive ? 'Job activated' : 'Job deactivated',
      isActive: updated.isActive,
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: 'Toggle failed',
    });
  }
});

// ── DELETE /api/admin/jobs/:id ────────────────────────────────────────────────
router.delete('/jobs/:id', adminAuth, async (req, res) => {
  try {

    await prisma.job.delete({
      where: {
        id: Number(req.params.id),
      },
    });

    res.json({
      message: 'Job deleted',
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: 'Delete failed',
    });
  }
});

// ── PATCH /api/admin/users/:id/plan ──────────────────────────────────────────
router.patch('/users/:id/plan', adminAuth, async (req, res) => {
  try {
    const { plan } = req.body;

    const valid = ['free', 'starter', 'growth', 'pro'];

    if (!valid.includes(plan)) {
      return res.status(400).json({
        error: 'Invalid plan',
      });
    }

    await prisma.user.update({
      where: {
        id: Number(req.params.id),
      },
      data: {
        plan,
        subscriptionStatus: plan === 'free' ? 'inactive' : 'active',
      },
    });

    res.json({
      message: `User plan updated to ${plan}`,
    });

  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: 'Plan update failed',
    });
  }
});

// ── POST /api/admin/jobs ──────────────────────────────────────────────────────
router.post('/jobs', adminAuth, async (req, res) => {
  try {

    const {
      title,
      company,
      location,
      remote,
      description,
      requirements,
      salary,
      job_url,
      apply_email,
      apply_url,
      source,
    } = req.body;

    if (!title || !company) {
      return res.status(400).json({
        error: 'Title and company are required',
      });
    }

    const job = await prisma.job.create({
      data: {
        title,
        company,
        location: location || '',
        remote: !!remote,
        description: description || '',
        requirements: requirements || '',
        salary: salary || '',
        jobUrl: job_url || '',
        applyEmail: apply_email || '',
        applyUrl: apply_url || '',
        source: source || 'admin',
        isActive: true,
      },
    });

    res.status(201).json({
      id: job.id,
      message: 'Job added successfully',
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: 'Failed to add job',
    });
  }
});

module.exports = router;