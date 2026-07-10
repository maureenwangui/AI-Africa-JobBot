// routes/admin.js — Fixed enum values, ID types, and date formatting
const express = require('express');
const prisma   = require('../confiq/prisma');
const { adminAuth } = require('../middleware/auth');

const router = express.Router();

// helper — format date safely
const fmt = (d) => d ? new Date(d).toISOString() : null;

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
      // Fixed: 'active' → 'ACTIVE' (Prisma enum)
      prisma.user.count({ where: { subscriptionStatus: 'ACTIVE' } }),
      prisma.application.count(),
      prisma.job.count({ where: { isActive: true } }),
      prisma.job.count(),
      // Fixed: 'active' → 'ACTIVE'
      prisma.subscription.count({ where: { status: 'ACTIVE' } }),
      // Fixed: 'free' → 'FREE'
      prisma.user.count({ where: { plan: 'FREE' } }),
      // Fixed: 'starter' → 'STARTER'
      prisma.user.count({ where: { plan: 'STARTER' } }),
      // Fixed: 'growth' → 'GROWTH'
      prisma.user.count({ where: { plan: 'GROWTH' } }),
      // Fixed: 'pro' → 'PRO'
      prisma.user.count({ where: { plan: 'PRO' } }),
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
        profile:      true,
        resumes: {
          orderBy: { createdAt: 'desc' },
          take: 1,
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
      // Fixed: format Date object → ISO string so frontend renders correctly
      created_at:          fmt(u.createdAt),
      app_count:           u.applications.length,
      cv_filename:         u.resumes?.[0]?.originalName || null,
      skills:              u.profile?.skills        || null,
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
        job:  { select: { id: true, title: true, company: true, location: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });

    const formatted = apps.map(a => ({
      id:         a.id,
      user_id:    a.userId,
      job_id:     a.jobId,
      status:     a.status.toLowerCase(),
      match_score: a.matchScore,
      created_at: fmt(a.createdAt),
      applied_at: fmt(a.appliedAt),
      // user fields
      email:      a.user?.email || '',
      name:       a.user?.name  || '',
      // job fields
      job_title:  a.job?.title    || '',
      company:    a.job?.company  || '',
      location:   a.job?.location || '',
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
      include: { applications: { select: { id: true } } },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });

    const formatted = jobs.map(j => ({
      id:                j.id,
      title:             j.title,
      company:           j.company,
      location:          j.location,
      remote:            j.remote ? 1 : 0,
      salary:            j.salary,
      is_active:         j.isActive ? 1 : 0,
      source:            j.source,
      apply_email:       j.applyEmail,
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
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    const formatted = subs.map(s => ({
      id:            s.id,
      user_id:       s.userId,
      plan:          s.plan.toLowerCase(),
      billing_cycle: s.billingCycle?.toLowerCase() || 'monthly',
      provider:      s.provider?.toLowerCase()     || '',
      status:        s.status.toLowerCase(),
      amount:        s.amount,
      currency:      s.currency,
      created_at:    fmt(s.createdAt),
      email:         s.user?.email || '',
      name:          s.user?.name  || '',
    }));

    res.json(formatted);

  } catch (err) {
    console.error('Admin subscriptions error:', err.message);
    res.status(500).json({ error: 'Failed to load subscriptions' });
  }
});

// ── PATCH /api/admin/jobs/:id/toggle ─────────────────────────────────────────
router.patch('/jobs/:id/toggle', adminAuth, async (req, res) => {
  try {
    // Fixed: Number(id) → String(id) — Prisma uses String IDs (cuid)
    const job = await prisma.job.findUnique({
      where: { id: String(req.params.id) },
    });
    if (!job) return res.status(404).json({ error: 'Job not found' });

    const updated = await prisma.job.update({
      where: { id: String(req.params.id) },
      data:  { isActive: !job.isActive },
    });

    res.json({
      message:  updated.isActive ? 'Job activated' : 'Job deactivated',
      is_active: updated.isActive ? 1 : 0,
    });

  } catch (err) {
    console.error('Toggle job error:', err.message);
    res.status(500).json({ error: 'Toggle failed' });
  }
});

// ── DELETE /api/admin/jobs/:id ────────────────────────────────────────────────
router.delete('/jobs/:id', adminAuth, async (req, res) => {
  try {
    // Fixed: Number(id) → String(id)
    await prisma.job.delete({ where: { id: String(req.params.id) } });
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
    // Fixed: validate against uppercase Prisma enum values
    const validPlans = ['FREE', 'STARTER', 'GROWTH', 'PRO'];
    const planUpper  = plan?.toUpperCase();
    if (!validPlans.includes(planUpper)) {
      return res.status(400).json({ error: 'Invalid plan' });
    }

    // Fixed: Number(id) → String(id)
    await prisma.user.update({
      where: { id: String(req.params.id) },
      data: {
        plan:               planUpper,
        subscriptionStatus: planUpper === 'FREE' ? 'PENDING' : 'ACTIVE',
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
      title, company, location, remote,
      description, requirements, salary,
      job_url, apply_email, apply_url, source,
    } = req.body;

    if (!title || !company) {
      return res.status(400).json({ error: 'Title and company are required' });
    }

    const job = await prisma.job.create({
      data: {
        title,
        company,
        location:    location    || '',
        remote:      !!remote,
        description: description || '',
        requirements: requirements || '',
        salary:      salary      || '',
        jobUrl:      job_url     || '',
        applyEmail:  apply_email || '',
        applyUrl:    apply_url   || '',
        source:      source      || 'admin',
        isActive:    true,
      },
    });

    res.status(201).json({ id: job.id, message: 'Job added successfully' });

  } catch (err) {
    console.error('Add job error:', err.message);
    res.status(500).json({ error: 'Failed to add job' });
  }
});

module.exports = router;