// routes/jobs.js
const express = require('express');
const getDb = require('../db/connection');
const { auth } = require('../middleware/auth');
const matchingService = require('../services/matchingService');

const router = express.Router();

// GET /api/jobs — all active jobs
router.get('/', auth, (req, res) => {
  const db = getDb();
  const { limit = 50, offset = 0, location, remote } = req.query;
  let query = 'SELECT * FROM jobs WHERE is_active = 1';
  const params = [];
  if (location) { query += ' AND location LIKE ?'; params.push(`%${location}%`); }
  if (remote === 'true') { query += ' AND remote = 1'; }
  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(Number(limit), Number(offset));
  res.json(db.prepare(query).all(...params));
});

// GET /api/jobs/matches — jobs matched to user profile
router.get('/matches', auth, async (req, res) => {
  try {
    const db = getDb();
    const profile = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(req.user.id);
    if (!profile) return res.status(404).json({ error: 'Profile not found. Please upload your CV.' });

    const jobs = db.prepare('SELECT * FROM jobs WHERE is_active = 1 ORDER BY created_at DESC LIMIT 200').all();
    if (!jobs.length) return res.json([]);

    const matches = await matchingService.matchJobsToProfile(profile, jobs);
    res.json(matches);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Matching failed' });
  }
});

// GET /api/jobs/:id
router.get('/:id', auth, (req, res) => {
  const db = getDb();
  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(job);
});

// POST /api/jobs — admin adds job
router.post('/', auth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const { title, company, location, remote, description, requirements, salary, job_url, apply_email, apply_url, source } = req.body;
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO jobs (title, company, location, remote, description, requirements, salary, job_url, apply_email, apply_url, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(title, company, location, remote ? 1 : 0, description, requirements, salary, job_url, apply_email, apply_url, source);
  res.status(201).json({ id: result.lastInsertRowid, message: 'Job added' });
});

module.exports = router;