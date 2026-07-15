// routes/admin.js
const express = require('express');
const prisma   = require('../confiq/prisma');
const { adminAuth } = require('../middleware/auth');

const router = express.Router();

// helper — format date safely
const fmt = (d) => d ? new Date(d).toISOString() : null;

// Public-facing plan slugs <-> Prisma SubscriptionPlan enum
const PLAN_SLUG_TO_ENUM = { free: 'FREE', starter: 'STARTER', growth: 'PROFESSIONAL', pro: 'BUSINESS' };

// ── GET /api/admin/stats ──────────────────────────────────────────────────────
router.get('/stats', adminAuth, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

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
      appsToday,
      usersToday,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { subscriptionStatus: 'ACTIVE' } }),
      prisma.application.count(),
      prisma.job.count({ where: { status: 'ACTIVE' } }),
      prisma.job.count(),
      prisma.subscription.count({ where: { status: 'ACTIVE' } }),
      prisma.user.count({ where: { plan: 'FREE' } }),
      prisma.user.count({ where: { plan: 'STARTER' } }),
      prisma.user.count({ where: { plan: 'PROFESSIONAL' } }),
      prisma.user.count({ where: { plan: 'BUSINESS' } }),
      prisma.application.count({ where: { createdAt: { gte: today } } }),
      prisma.user.count({ where: { createdAt: { gte: today } } }),
    ]);

    const mrr_kes = (planStarter * 500) + (planGrowth * 1200) + (planPro * 2500);

    res.json({
      total_users:        totalUsers,
      active_subscribers: activeSubscribers,
      total_applications: totalApplications,
      total_jobs:         totalJobs,
      total_jobs_all:     totalJobsAll,
      subs_active:        subsActive,
      plan_breakdown: {
        free:    planFree,
        starter: planStarter,
        growth:  planGrowth,
        pro:     planPro,
      },
      mrr_kes,
      apps_today:  appsToday,
      users_today: usersToday,
    });

  } catch (err) {
    console.error('Admin stats error:', err.message);
    res.status(500).json({ error: 'Failed to load stats' });
  }
});

// ── GET /api/admin/users ──────────────────────────────────────────────────────
router.get('/users', adminAuth, async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      include: {
        profile: true,
        // Latest resume for cv_filename display in admin
        resumes: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            originalName: true,
            fileUrl:      true,
            createdAt:    true,
          },
        },
        applications: { select: { id: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const formatted = users.map(u => ({
      id:                  u.id,
      email:               u.email,
      name:                u.name,
      phone:               u.phone,
      plan:                u.plan.toLowerCase(),
      subscription_status: u.subscriptionStatus.toLowerCase(),
      role:                u.role.toLowerCase(),
      created_at:          fmt(u.createdAt),
      app_count:           u.applications.length,
      cv_filename:         u.resumes?.[0]?.originalName || null,
      cv_url:              u.resumes?.[0]?.fileUrl      || null,
      skills:              u.profile?.skills            || null,
      preferred_location:  u.profile?.preferredLocations || null,
    }));

    res.json(formatted);

  } catch (err) {
    console.error('Admin users error:', err.message);
    res.status(500).json({ error: 'Failed to load users' });
  }
});

// ── GET /api/admin/applications ───────────────────────────────────────────────
router.get('/applications', adminAuth, async (req, res) => {
  try {
    const apps = await prisma.application.findMany({
      include: {
        user: { select: { id: true, email: true, name: true } },
        job:  { select: { id: true, title: true, location: true, company: { select: { name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });

    const formatted = apps.map(a => ({
      id:          a.id,
      user_id:     a.userId,
      job_id:      a.jobId,
      status:      a.status.toLowerCase(),
      match_score: a.matchScore,
      created_at:  fmt(a.createdAt),
      applied_at:  fmt(a.appliedAt),
      email:       a.user?.email || '',
      name:        a.user?.name  || '',
      job_title:   a.job?.title           || '',
      company:     a.job?.company?.name   || '',
      location:    a.job?.location        || '',
    }));

    res.json(formatted);

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
        company: { select: { name: true } },
        applications: { select: { id: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });

    const formatted = jobs.map(j => ({
      id:                j.id,
      title:             j.title,
      company:           j.company?.name || '',
      location:          j.location,
      remote:            j.remoteType === 'REMOTE' ? 1 : 0,
      salary_min:        j.salaryMin,
      salary_max:        j.salaryMax,
      is_active:         j.status === 'ACTIVE' ? 1 : 0,
      source:            j.source,
      apply_url:         j.applyUrl,
      created_at:        fmt(j.createdAt),
      application_count: j.applications.length,
    }));

    res.json(formatted);

  } catch (err) {
    console.error('Admin jobs error:', err.message);
    res.status(500).json({ error: 'Failed to load jobs' });
  }
});

// ── GET /api/admin/subscriptions ─────────────────────────────────────────────
router.get('/subscriptions', adminAuth, async (req, res) => {
  try {
    const subs = await prisma.subscription.findMany({
      include: {
        user: { select: { email: true, name: true } },
        payments: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    const formatted = subs.map(s => {
      const latestPayment = s.payments?.[0];
      return {
        id:            s.id,
        user_id:       s.userId,
        plan:          s.plan.toLowerCase(),
        billing_cycle: s.billingCycle?.toLowerCase() || 'monthly',
        provider:      latestPayment?.provider?.toLowerCase() || '',
        status:        s.status.toLowerCase(),
        amount:        latestPayment?.amount   ?? null,
        currency:      latestPayment?.currency ?? 'KES',
        created_at:    fmt(s.createdAt),
        email:         s.user?.email || '',
        name:          s.user?.name  || '',
      };
    });

    res.json(formatted);

  } catch (err) {
    console.error('Admin subscriptions error:', err.message);
    res.status(500).json({ error: 'Failed to load subscriptions' });
  }
});

// ── PATCH /api/admin/jobs/:id/toggle ─────────────────────────────────────────
router.patch('/jobs/:id/toggle', adminAuth, async (req, res) => {
  try {
    const job = await prisma.job.findUnique({
      where: { id: req.params.id },
    });
    if (!job) return res.status(404).json({ error: 'Job not found' });

    const newStatus = job.status === 'ACTIVE' ? 'CLOSED' : 'ACTIVE';

    const updated = await prisma.job.update({
      where: { id: req.params.id },
      data:  { status: newStatus },
    });

    res.json({
      message:   updated.status === 'ACTIVE' ? 'Job activated' : 'Job deactivated',
      is_active: updated.status === 'ACTIVE' ? 1 : 0,
    });

  } catch (err) {
    console.error('Toggle job error:', err.message);
    res.status(500).json({ error: 'Toggle failed' });
  }
});

// ── DELETE /api/admin/jobs/:id ────────────────────────────────────────────────
router.delete('/jobs/:id', adminAuth, async (req, res) => {
  try {
    await prisma.job.delete({ where: { id: req.params.id } });
    res.json({ message: 'Job deleted' });
  } catch (err) {
    console.error('Delete job error:', err.message);
    res.status(500).json({ error: 'Delete failed' });
  }
});

// ── PATCH /api/admin/users/:id/plan ──────────────────────────────────────────
router.patch('/users/:id/plan', adminAuth, async (req, res) => {
  try {
    const { plan } = req.body;
    const planEnum = PLAN_SLUG_TO_ENUM[String(plan).toLowerCase()];
    if (!planEnum) {
      return res.status(400).json({ error: 'Invalid plan. Choose: free, starter, growth, or pro' });
    }

    await prisma.user.update({
      where: { id: req.params.id },
      data: {
        plan:               planEnum,
        subscriptionStatus: planEnum === 'FREE' ? 'PENDING' : 'ACTIVE',
      },
    });

    res.json({ message: `User plan updated to ${plan}` });

  } catch (err) {
    console.error('Plan update error:', err.message);
    res.status(500).json({ error: 'Plan update failed' });
  }
});

// ── POST /api/admin/jobs ──────────────────────────────────────────────────────
router.post('/jobs', adminAuth, async (req, res) => {
  try {
    const {
      title, company, location,
      remote_type = 'ONSITE', employment_type = 'FULL_TIME',
      description, requirements, salary_min, salary_max,
      apply_url, source,
    } = req.body;

    if (!title || !company) {
      return res.status(400).json({ error: 'Title and company are required' });
    }

    const companyRecord = await prisma.company.upsert({
      where:  { name: company },
      update: {},
      create: { name: company },
    });

    const job = await prisma.job.create({
      data: {
        title,
        companyId:       companyRecord.id,
        location:        location     || '',
        remoteType:      remote_type,
        employmentType:  employment_type,
        description:     description  || '',
        requirements:    requirements || '',
        salaryMin:       salary_min ? Number(salary_min) : null,
        salaryMax:       salary_max ? Number(salary_max) : null,
        applyUrl:        apply_url    || '',
        source:          source       || 'admin',
        status:          'ACTIVE',
      },
    });

    res.status(201).json({ id: job.id, message: 'Job added successfully' });

  } catch (err) {
    console.error('Add job error:', err.message);
    res.status(500).json({ error: 'Failed to add job' });
  }
});

// ── GET /api/admin/resumes ────────────────────────────────────────────────────
// Returns all uploaded CVs with correct Render download URLs
router.get('/resumes', adminAuth, async (req, res) => {
  try {
    const BACKEND_URL = process.env.BACKEND_URL || 'https://ai-africa-jobbot.onrender.com';

    const rows = await prisma.resume.findMany({
      include: {
        user: { select: { id: true, email: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });

    const resumes = rows.map(r => ({
      id:         r.id,
      user_id:    r.userId,
      name:       r.user?.name  || '—',
      email:      r.user?.email || '—',
      file_name:  r.originalName,
      // Use absolute Render URL so the Netlify frontend downloads correctly
      file_url:   r.fileUrl
        ? (r.fileUrl.startsWith('http') ? r.fileUrl : `${BACKEND_URL}${r.fileUrl}`)
        : `${BACKEND_URL}/uploads/cvs/user_${r.userId}/${r.originalName}`,
      file_size:  r.fileSize,
      mime_type:  r.fileType,
      created_at: fmt(r.createdAt),
    }));

    res.json(resumes);

  } catch (err) {
    console.error('Admin resumes error:', err.message);
    res.status(500).json({ error: 'Failed to load resumes' });
  }
});

module.exports = router;