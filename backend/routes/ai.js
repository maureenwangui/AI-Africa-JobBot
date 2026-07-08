// routes/ai.js — Protected AI endpoints
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { auth } = require('../middleware/auth');
const { checkSubscription, usageLimitMiddleware, deductUsage } = require('../middleware/subscription');
const aiService = require('../services/aiService');

const router = express.Router();
const prisma = new PrismaClient();

// POST /api/ai/generate-cover-letter
router.post('/generate-cover-letter', auth, checkSubscription, usageLimitMiddleware('cover_letters'), async (req, res) => {
  try {
    const { job_id } = req.body;
    if (!job_id) return res.status(400).json({ error: 'job_id required' });

    // Fetch profile and job in parallel
    const [profile, job] = await Promise.all([
      prisma.profile.findUnique({ where: { user_id: req.user.id } }),
      prisma.job.findUnique({ where: { id: job_id } }),
    ]);

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
    const profile = await prisma.profile.findUnique({
      where: { user_id: req.user.id },
    });
    if (!profile) return res.status(404).json({ error: 'Profile not found' });

    deductUsage(req.user.id, 'cv');

    // With Prisma + PostgreSQL Json columns, fields are already native JS values —
    // no manual JSON.parse needed. Guard with Array.isArray in case of null.
    const skills     = Array.isArray(profile.skills)     ? profile.skills     : [];
    const experience = Array.isArray(profile.experience) ? profile.experience : [];
    const education  = Array.isArray(profile.education)  ? profile.education  : [];

    res.json({
      profile: { ...profile, skills, experience, education },
      message: 'CV data ready for export',
    });
  } catch (err) {
    res.status(500).json({ error: 'CV generation failed' });
  }
});

// POST /api/ai/auto-apply — Pro/Growth only, queue top matches
router.post('/auto-apply', auth, checkSubscription, usageLimitMiddleware('applications'), async (req, res) => {
  try {
    const profile = await prisma.profile.findUnique({
      where: { user_id: req.user.id },
    });
    if (!profile?.cv_filename) return res.status(400).json({ error: 'Please upload your CV first' });

    const { job_ids } = req.body;
    if (!job_ids?.length) return res.status(400).json({ error: 'job_ids array required' });

    const applied = [];

    // Sequential loop intentionally capped at 5 — matches original behaviour
    for (const job_id of job_ids.slice(0, 5)) {
      const existing = await prisma.application.findFirst({
        where:  { user_id: req.user.id, job_id },
        select: { id: true },
      });
      if (existing) continue;

      const job = await prisma.job.findUnique({ where: { id: job_id } });
      if (!job) continue;

      const cover_letter = await aiService.generateCoverLetter(profile, job);

      await prisma.application.create({
        data: {
          user_id:      req.user.id,
          job_id,
          status:       'sent',
          cover_letter,
          applied_at:   new Date(),
        },
      });

      deductUsage(req.user.id, 'applications');
      applied.push({ job_id, job_title: job.title, company: job.company });
    }

    res.json({
      applied,
      count:   applied.length,
      message: `Applied to ${applied.length} jobs`,
    });
  } catch (err) {
    res.status(500).json({ error: 'Auto-apply failed' });
  }
});

module.exports = router;