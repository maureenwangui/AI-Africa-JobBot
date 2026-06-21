// routes/admin.js
const express = require('express');
const getDb = require('../db/connection');
const { adminAuth } = require('../middleware/auth');
const router = express.Router();

router.get('/users', adminAuth, (req, res) => {
  const db = getDb();
  res.json(db.prepare('SELECT id, email, name, phone, plan, subscription_status, created_at FROM users ORDER BY created_at DESC').all());
});

router.get('/applications', adminAuth, (req, res) => {
  const db = getDb();
  res.json(db.prepare(`
    SELECT a.*, u.email, u.name, j.title AS job_title, j.company
    FROM applications a JOIN users u ON a.user_id = u.id JOIN jobs j ON a.job_id = j.id
    ORDER BY a.created_at DESC LIMIT 200
  `).all());
});

router.get('/jobs', adminAuth, (req, res) => {
  const db = getDb();
  res.json(db.prepare('SELECT * FROM jobs ORDER BY created_at DESC LIMIT 200').all());
});

router.get('/stats', adminAuth, (req, res) => {
  const db = getDb();
  res.json({
    total_users: db.prepare('SELECT COUNT(*) as c FROM users').get().c,
    active_subscribers: db.prepare("SELECT COUNT(*) as c FROM users WHERE subscription_status = 'active'").get().c,
    total_applications: db.prepare('SELECT COUNT(*) as c FROM applications').get().c,
    total_jobs: db.prepare('SELECT COUNT(*) as c FROM jobs WHERE is_active = 1').get().c,
    revenue_est: db.prepare("SELECT COUNT(*) as c FROM subscriptions WHERE status = 'active'").get().c * 9, // avg estimate
  });
});

// Toggle job active status
router.patch('/jobs/:id/toggle', adminAuth, (req, res) => {
  const db = getDb();
  const job = db.prepare('SELECT is_active FROM jobs WHERE id = ?').get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Not found' });
  db.prepare('UPDATE jobs SET is_active = ? WHERE id = ?').run(job.is_active ? 0 : 1, req.params.id);
  res.json({ message: 'Updated' });
});

module.exports = router;