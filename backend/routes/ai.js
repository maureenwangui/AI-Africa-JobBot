// routes/ai.js — Protected AI endpoints
const express = require('express');
const { auth } = require('../middleware/auth');
const { checkSubscription, usageLimitMiddleware, deductUsage } = require('../middleware/subscription');
const aiService = require('../services/aiService');

const router = express.Router();
const prisma = require('../confiq/prisma');

// Profile.skills/experience/education are stored as JSON-encoded strings.
function safeParseArray(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// POST /api/ai/generate-cover-letter
router.post('/generate-cover-letter', auth, checkSubscription, usageLimitMiddleware('cover_letters'), async (req, res) => {
  try {
    const { job_id } = req.body;
    if (!job_id) return res.status(400).json({ error: 'job_id required' });

    // Fetch profile and job (with company name) in parallel
    const [profile, job] = await Promise.all([
      prisma.profile.findUnique({ where: { userId: req.user.id } }),
      prisma.job.findUnique({ where: { id: job_id }, include: { company: true } }),
    ]);

    if (!profile || !job) return res.status(404).json({ error: 'Profile or job not found' });

    const coverLetter = await aiService.generateCoverLetter(profile, {
      ...job,
      company: job.company?.name || 'the company',
    });

    await deductUsage(req.user.id, 'cover_letters');

    res.json({ cover_letter: coverLetter });
  } catch (err) {
    console.error('generate-cover-letter error:', err.message);
    res.status(500).json({ error: 'Cover letter generation failed' });
  }
});

// POST /api/ai/generate-cv
router.post('/generate-cv', auth, checkSubscription, usageLimitMiddleware('cv'), async (req, res) => {
  try {
    const profile = await prisma.profile.findUnique({
      where: { userId: req.user.id },
    });
    if (!profile) return res.status(404).json({ error: 'Profile not found' });

    await deductUsage(req.user.id, 'cv');

    // Profile.skills/experience/education are stored as JSON-encoded strings.
    const skills     = safeParseArray(profile.skills);
    const experience = safeParseArray(profile.experience);
    const education   = safeParseArray(profile.education);

    res.json({
      profile: { ...profile, skills, experience, education },
      message: 'CV data ready for export',
    });
  } catch (err) {
    console.error('generate-cv error:', err.message);
    res.status(500).json({ error: 'CV generation failed' });
  }
});

// POST /api/ai/auto-apply — Pro/Growth only, queue top matches
router.post('/auto-apply', auth, checkSubscription, usageLimitMiddleware('applications'), async (req, res) => {
  try {
    const profile = await prisma.profile.findUnique({
      where: { userId: req.user.id },
    });

    const resumeOnFile = await prisma.resume.findFirst({ where: { userId: req.user.id } });
    if (!profile || !resumeOnFile) {
      return res.status(400).json({ error: 'Please upload your CV first' });
    }

    const { job_ids } = req.body;
    if (!job_ids?.length) return res.status(400).json({ error: 'job_ids array required' });

    const applied = [];

    // Sequential loop intentionally capped at 5 — matches original behaviour
    for (const jobId of job_ids.slice(0, 5)) {
      const existing = await prisma.application.findFirst({
        where:  { userId: req.user.id, jobId },
        select: { id: true },
      });
      if (existing) continue;

      const job = await prisma.job.findUnique({ where: { id: jobId }, include: { company: true } });
      if (!job) continue;

      const companyName = job.company?.name || 'the company';
      const coverLetterText = await aiService.generateCoverLetter(profile, { ...job, company: companyName });

      const coverLetter = await prisma.coverLetter.create({
        data: {
          userId:      req.user.id,
          jobId:       job.id,
          companyName,
          content:     coverLetterText,
        },
      });

      await prisma.application.create({
        data: {
          userId:               req.user.id,
          jobId:                job.id,
          coverLetterId:        coverLetter.id,
          status:               'APPLIED',
          appliedAutomatically: true,
          appliedAt:            new Date(),
        },
      });

      await deductUsage(req.user.id, 'applications');
      applied.push({ job_id: job.id, job_title: job.title, company: companyName });
    }

    res.json({
      applied,
      count:   applied.length,
      message: `Applied to ${applied.length} jobs`,
    });
  } catch (err) {
    console.error('auto-apply error:', err.message);
    res.status(500).json({ error: 'Auto-apply failed' });
  }
});

module.exports = router;