// routes/ai.js — Protected AI endpoints
const express = require('express');
const getDb = require('../db/connection');
const { auth } = require('../middleware/auth');
const { checkSubscription, usageLimitMiddleware, deductUsage } = require('../middleware/subscription');
const aiService = require('../services/aiService');
const router = express.Router();

// POST /api/ai/generate-cover-letter
router.post('/generate-cover-letter', auth, checkSubscription, usageLimitMiddleware('cover_letters'), async (req, res) => {
  try {
    const { job_id } = req.body;
    if (!job_id) return res.status(400).json({ error: 'job_id required' });

    const db = getDb();
    const profile = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(req.user.id);
    const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(job_id);

    if (!profile || !job) return res.status(404).json({ error: 'Profile or job not found' });

    const coverLetter = await aiService.generateCoverLetter(profile, job);
    deductUsage(req.user.id, 'cover_letters');

    res.json({ cover_letter: coverLetter });
  } catch (err) {
    res.status(500).json({ error: 'Cover letter generation failed' });
  }
});

// POST /api/ai/generate-cv
router.post('/generate-cv', auth, checkSubscription, usageLimitMiddleware('cv'), async (req, res) => {
  try {
    const db = getDb();
    const profile = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(req.user.id);
    if (!profile) return res.status(404).json({ error: 'Profile not found' });

    // Return structured CV data (frontend renders it)
    deductUsage(req.user.id, 'cv');
    const skills = (() => { try { return JSON.parse(profile.skills || '[]'); } catch { return []; } })();
    const experience = (() => { try { return JSON.parse(profile.experience || '[]'); } catch { return []; } })();
    const education = (() => { try { return JSON.parse(profile.education || '[]'); } catch { return []; } })();

    res.json({ profile: { ...profile, skills, experience, education }, message: 'CV data ready for export' });
  } catch (err) {
    res.status(500).json({ error: 'CV generation failed' });
  }
});

// POST /api/ai/auto-apply — Pro/Growth only, queue top matches
router.post('/auto-apply', auth, checkSubscription, usageLimitMiddleware('applications'), async (req, res) => {
  try {
    const db = getDb();
    const profile = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(req.user.id);
    if (!profile?.cv_filename) return res.status(400).json({ error: 'Please upload your CV first' });

    const { job_ids } = req.body; // Array of job IDs to apply to
    if (!job_ids?.length) return res.status(400).json({ error: 'job_ids array required' });

    const applied = [];
    for (const job_id of job_ids.slice(0, 5)) {
      const existing = db.prepare('SELECT id FROM applications WHERE user_id = ? AND job_id = ?').get(req.user.id, job_id);
      if (existing) continue;

      const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(job_id);
      if (!job) continue;

      const cover_letter = await aiService.generateCoverLetter(profile, job);
      db.prepare(`
        INSERT INTO applications (user_id, job_id, status, cover_letter, applied_at)
        VALUES (?, ?, 'sent', ?, datetime('now'))
      `).run(req.user.id, job_id, cover_letter);

      deductUsage(req.user.id, 'applications');
      applied.push({ job_id, job_title: job.title, company: job.company });
    }

    res.json({ applied, count: applied.length, message: `Applied to ${applied.length} jobs` });
  } catch (err) {
    res.status(500).json({ error: 'Auto-apply failed' });
  }
});

module.exports = router;