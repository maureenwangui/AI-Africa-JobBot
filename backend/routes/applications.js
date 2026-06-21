const express = require('express');
const getDb = require('../db/connection');
const { auth } = require('../middleware/auth');
const notificationService = require('../services/notificationService');

const router = express.Router();

// GET all applications
router.get('/', auth, (req, res) => {
  const db = getDb();

  const apps = db.prepare(`
    SELECT a.*, j.title AS job_title, j.company, j.location
    FROM applications a
    JOIN jobs j ON a.job_id = j.id
    WHERE a.user_id = ?
    ORDER BY a.created_at DESC
    LIMIT 100
  `).all(req.user.id);

  res.json(apps);
});

// STATS
router.get('/stats', auth, (req, res) => {
  const db = getDb();

  res.json({
    total: db.prepare("SELECT COUNT(*) c FROM applications WHERE user_id=?").get(req.user.id).c,
    sent: db.prepare("SELECT COUNT(*) c FROM applications WHERE user_id=? AND status='sent'").get(req.user.id).c,
    viewed: db.prepare("SELECT COUNT(*) c FROM applications WHERE user_id=? AND status='viewed'").get(req.user.id).c,
    interview: db.prepare("SELECT COUNT(*) c FROM applications WHERE user_id=? AND status='interview'").get(req.user.id).c,
  });
});

// APPLY
router.post('/', auth, async (req, res) => {
  try {
    const { job_id, cover_letter } = req.body;
    if (!job_id) return res.status(400).json({ error: 'job_id required' });

    const db = getDb();

    const existing = db.prepare(
      'SELECT id FROM applications WHERE user_id=? AND job_id=?'
    ).get(req.user.id, job_id);

    if (existing) {
      return res.status(409).json({ error: 'Already applied' });
    }

    const result = db.prepare(`
      INSERT INTO applications (user_id, job_id, status, cover_letter, applied_at)
      VALUES (?, ?, 'sent', ?, datetime('now'))
    `).run(req.user.id, job_id, cover_letter || '');

    const job = db.prepare(
      'SELECT title, company FROM jobs WHERE id=?'
    ).get(job_id);

    if (notificationService?.sendApplicationAlert) {
      notificationService.sendApplicationAlert(req.user, job).catch(console.error);
    }

    res.status(201).json({
      id: result.lastInsertRowid,
      message: 'Application submitted'
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Application failed' });
  }
});

// UPDATE STATUS
router.patch('/:id/status', auth, (req, res) => {
  const { status } = req.body;

  const valid = ['queued','sent','viewed','interview','rejected','hired'];
  if (!valid.includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  const db = getDb();

  db.prepare(`
    UPDATE applications
    SET status=?, updated_at=datetime('now')
    WHERE id=? AND user_id=?
  `).run(status, req.params.id, req.user.id);

  res.json({ message: 'Updated' });
});

module.exports = router;