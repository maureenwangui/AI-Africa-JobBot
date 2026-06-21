// routes/dashboard.js
const express = require('express');
const getDb = require('../db/connection');
const { auth } = require('../middleware/auth');
const { PLAN_LIMITS, getOrCreateUsage } = require('../middleware/subscription');
const router = express.Router();

router.get('/', auth, (req, res) => {
  const db = getDb();
  const uid = req.user.id;

  const total_jobs = db.prepare('SELECT COUNT(*) as c FROM jobs WHERE is_active = 1').get().c;
  const total_applications = db.prepare('SELECT COUNT(*) as c FROM applications WHERE user_id = ?').get(uid).c;
  const sent = db.prepare("SELECT COUNT(*) as c FROM applications WHERE user_id = ? AND status = 'sent'").get(uid).c;
  const interview = db.prepare("SELECT COUNT(*) as c FROM applications WHERE user_id = ? AND status = 'interview'").get(uid).c;

  const recent_applications = db.prepare(`
    SELECT a.*, j.title AS job_title, j.company, j.location
    FROM applications a JOIN jobs j ON a.job_id = j.id
    WHERE a.user_id = ? ORDER BY a.created_at DESC LIMIT 5
  `).all(uid);

  const recent_jobs = db.prepare('SELECT * FROM jobs WHERE is_active = 1 ORDER BY created_at DESC LIMIT 5').all();
  const usage = getOrCreateUsage(db, uid);
  const limits = PLAN_LIMITS[req.user.plan] || PLAN_LIMITS.free;

  res.json({
    stats: { total_jobs, total_applications, sent, interview },
    recent_applications,
    recent_jobs,
    usage: { ...usage, limits },
    plan: req.user.plan,
    subscription_status: req.user.subscription_status,
  });
});

module.exports = router;
