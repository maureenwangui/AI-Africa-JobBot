// routes/admin.js — Complete Admin API
const express = require('express');
const getDb = require('../db/connection');
const { adminAuth } = require('../middleware/auth');

const router = express.Router();

// ── GET /api/admin/stats ──────────────────────────────────────────────────────
router.get('/stats', adminAuth, (req, res) => {
  try {
    const db = getDb();
    const total_users        = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
    const active_subscribers = db.prepare("SELECT COUNT(*) as c FROM users WHERE subscription_status = 'active'").get().c;
    const total_applications = db.prepare('SELECT COUNT(*) as c FROM applications').get().c;
    const total_jobs         = db.prepare('SELECT COUNT(*) as c FROM jobs WHERE is_active = 1').get().c;
    const total_jobs_all     = db.prepare('SELECT COUNT(*) as c FROM jobs').get().c;
    const subs_active        = db.prepare("SELECT COUNT(*) as c FROM subscriptions WHERE status = 'active'").get().c;

    // Plan breakdown
    const plan_free    = db.prepare("SELECT COUNT(*) as c FROM users WHERE plan = 'free'").get().c;
    const plan_starter = db.prepare("SELECT COUNT(*) as c FROM users WHERE plan = 'starter'").get().c;
    const plan_growth  = db.prepare("SELECT COUNT(*) as c FROM users WHERE plan = 'growth'").get().c;
    const plan_pro     = db.prepare("SELECT COUNT(*) as c FROM users WHERE plan = 'pro'").get().c;

    // Revenue estimate in KES
    const mrr_kes = (plan_starter * 500) + (plan_growth * 1200) + (plan_pro * 2500);

    // Applications today
    const apps_today = db.prepare("SELECT COUNT(*) as c FROM applications WHERE date(created_at) = date('now')").get().c;

    // New users today
    const users_today = db.prepare("SELECT COUNT(*) as c FROM users WHERE date(created_at) = date('now')").get().c;

    res.json({
      total_users,
      active_subscribers,
      total_applications,
      total_jobs,
      total_jobs_all,
      subs_active,
      plan_breakdown: { free: plan_free, starter: plan_starter, growth: plan_growth, pro: plan_pro },
      mrr_kes,
      apps_today,
      users_today,
    });
  } catch (err) {
    console.error('Admin stats error:', err.message);
    res.status(500).json({ error: 'Failed to load stats' });
  }
});

// ── GET /api/admin/users ──────────────────────────────────────────────────────
router.get('/users', adminAuth, (req, res) => {
  try {
    const db = getDb();
    const users = db.prepare(`
      SELECT
        u.id, u.email, u.name, u.phone, u.plan,
        u.subscription_status, u.role, u.created_at,
        (SELECT COUNT(*) FROM applications a WHERE a.user_id = u.id) as app_count,
        p.cv_filename,
        p.skills,
        p.preferred_location
      FROM users u
      LEFT JOIN profiles p ON u.id = p.user_id
      ORDER BY u.created_at DESC
    `).all();
    res.json(users);
  } catch (err) {
    console.error('Admin users error:', err.message);
    res.status(500).json({ error: 'Failed to load users' });
  }
});

// ── GET /api/admin/applications ───────────────────────────────────────────────
router.get('/applications', adminAuth, (req, res) => {
  try {
    const db = getDb();
    const apps = db.prepare(`
      SELECT
        a.id, a.status, a.match_score, a.applied_at, a.created_at,
        u.id as user_id, u.email, u.name,
        j.id as job_id, j.title AS job_title, j.company, j.location
      FROM applications a
      JOIN users u ON a.user_id = u.id
      JOIN jobs j  ON a.job_id  = j.id
      ORDER BY a.created_at DESC
      LIMIT 500
    `).all();
    res.json(apps);
  } catch (err) {
    console.error('Admin applications error:', err.message);
    res.status(500).json({ error: 'Failed to load applications' });
  }
});

// ── GET /api/admin/jobs ───────────────────────────────────────────────────────
router.get('/jobs', adminAuth, (req, res) => {
  try {
    const db = getDb();
    const jobs = db.prepare(`
      SELECT
        j.*,
        (SELECT COUNT(*) FROM applications a WHERE a.job_id = j.id) as application_count
      FROM jobs j
      ORDER BY j.created_at DESC
      LIMIT 500
    `).all();
    res.json(jobs);
  } catch (err) {
    console.error('Admin jobs error:', err.message);
    res.status(500).json({ error: 'Failed to load jobs' });
  }
});

// ── GET /api/admin/subscriptions ─────────────────────────────────────────────
router.get('/subscriptions', adminAuth, (req, res) => {
  try {
    const db = getDb();
    const subs = db.prepare(`
      SELECT s.*, u.email, u.name
      FROM subscriptions s
      JOIN users u ON s.user_id = u.id
      ORDER BY s.created_at DESC
      LIMIT 200
    `).all();
    res.json(subs);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load subscriptions' });
  }
});

// ── PATCH /api/admin/jobs/:id/toggle ─────────────────────────────────────────
router.patch('/jobs/:id/toggle', adminAuth, (req, res) => {
  try {
    const db = getDb();
    const job = db.prepare('SELECT is_active FROM jobs WHERE id = ?').get(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    const newStatus = job.is_active ? 0 : 1;
    db.prepare('UPDATE jobs SET is_active = ? WHERE id = ?').run(newStatus, req.params.id);
    res.json({ message: newStatus ? 'Job activated' : 'Job deactivated', is_active: newStatus });
  } catch (err) {
    res.status(500).json({ error: 'Toggle failed' });
  }
});

// ── DELETE /api/admin/jobs/:id ────────────────────────────────────────────────
router.delete('/jobs/:id', adminAuth, (req, res) => {
  try {
    const db = getDb();
    db.prepare('DELETE FROM jobs WHERE id = ?').run(req.params.id);
    res.json({ message: 'Job deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Delete failed' });
  }
});

// ── PATCH /api/admin/users/:id/plan ──────────────────────────────────────────
router.patch('/users/:id/plan', adminAuth, (req, res) => {
  try {
    const { plan } = req.body;
    const valid = ['free', 'starter', 'growth', 'pro'];
    if (!valid.includes(plan)) return res.status(400).json({ error: 'Invalid plan' });
    const db = getDb();
    db.prepare("UPDATE users SET plan = ?, subscription_status = ?, updated_at = datetime('now') WHERE id = ?")
      .run(plan, plan === 'free' ? 'inactive' : 'active', req.params.id);
    res.json({ message: `User plan updated to ${plan}` });
  } catch (err) {
    res.status(500).json({ error: 'Plan update failed' });
  }
});

// ── POST /api/admin/jobs ──────────────────────────────────────────────────────
router.post('/jobs', adminAuth, (req, res) => {
  try {
    const {
      title, company, location, remote, description,
      requirements, salary, job_url, apply_email, apply_url, source
    } = req.body;
    if (!title || !company) return res.status(400).json({ error: 'Title and company are required' });
    const db = getDb();
    const result = db.prepare(`
      INSERT INTO jobs (title, company, location, remote, description, requirements, salary, job_url, apply_email, apply_url, source, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).run(title, company, location || '', remote ? 1 : 0, description || '', requirements || '', salary || '', job_url || '', apply_email || '', apply_url || '', source || 'admin');
    res.status(201).json({ id: result.lastInsertRowid, message: 'Job added successfully' });
  } catch (err) {
    console.error('Add job error:', err.message);
    res.status(500).json({ error: 'Failed to add job' });
  }
});

module.exports = router;