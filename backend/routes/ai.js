// routes/ai.js
// Fixed: new PrismaClient() → shared singleton
// Fixed: profile findUnique uses userId (camelCase)
// Fixed: job findUnique uses String() not Number()
// Fixed: application create/findFirst uses camelCase and uppercase status enum
// Fixed: cover_letter field does not exist on Application — use coverLetterId relation
const express    = require('express');
const prisma     = require('../confiq/prisma');
const { auth }   = require('../middleware/auth');
const aiService  = require('../services/aiService');
const { deductUsage, PLAN_LIMITS } = require('../middleware/subscription');

const router = express.Router();

// POST /api/ai/generate-cover-letter
router.post('/generate-cover-letter', auth, async (req, res) => {
  try {
    const { job_id } = req.body;
    if (!job_id) return res.status(400).json({ error: 'job_id required' });

    // Fixed: userId camelCase
    const profile = await prisma.profile.findUnique({
      where: { userId: req.user.id },
    });
    if (!profile) return res.status(404).json({ error: 'Profile not found. Please upload your CV first.' });

    // Fixed: String() not Number()
    const job = await prisma.job.findUnique({
      where:   { id: String(job_id) },
      include: { company: { select: { name: true } } },
    });
    if (!job) return res.status(404).json({ error: 'Job not found' });

    // Flatten job for aiService
    const flatJob = { ...job, company: job.company?.name || '' };

    const coverLetter = await aiService.generateCoverLetter(profile, flatJob);

    // Save to CoverLetter table
    const saved = await prisma.coverLetter.create({
      data: {
        userId:  req.user.id,
        jobId:   String(job_id),
        company: job.company?.name || '',
        title:   `Cover letter for ${job.title}`,
        content: coverLetter,
      },
    });

    // Deduct usage
    await deductUsage(req.user.id, 'cover_letters');

    res.json({ cover_letter: coverLetter, cover_letter_id: saved.id });
  } catch (err) {
    console.error('Cover letter error:', err.message);
    res.status(500).json({ error: 'Failed to generate cover letter' });
  }
});

// POST /api/ai/generate-cv
router.post('/generate-cv', auth, async (req, res) => {
  try {
    // Fixed: userId camelCase
    const profile = await prisma.profile.findUnique({
      where: { userId: req.user.id },
    });
    if (!profile) return res.status(404).json({ error: 'Profile not found' });

    const latestResume = await prisma.resume.findFirst({
      where:   { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      message:  'CV profile retrieved',
      profile: {
        name:       req.user.name,
        email:      req.user.email,
        phone:      req.user.phone,
        summary:    profile.summary,
        skills:     (() => { try { return JSON.parse(profile.skills || '[]'); } catch { return []; } })(),
        experience: (() => { try { return JSON.parse(profile.experience || '[]'); } catch { return []; } })(),
        education:  (() => { try { return JSON.parse(profile.education || '[]'); } catch { return []; } })(),
        cv_url:     latestResume?.fileUrl || null,
      },
    });
  } catch (err) {
    console.error('Generate CV error:', err.message);
    res.status(500).json({ error: 'Failed to retrieve CV data' });
  }
});

// POST /api/ai/auto-apply
router.post('/auto-apply', auth, async (req, res) => {
  try {
    const { job_id } = req.body;
    if (!job_id) return res.status(400).json({ error: 'job_id required' });

    // Check plan limits
    const plan   = req.user.plan || 'free';
    const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.free;

    const month = new Date().toISOString().slice(0, 7);
    const usage = await prisma.usage.findUnique({
      where: { userId_month: { userId: req.user.id, month } },
    });

    const used = usage?.applicationsUsed || 0;
    if (used >= limits.applications) {
      return res.status(429).json({
        error: 'Monthly application limit reached. Upgrade your plan.',
        code:  'USAGE_LIMIT_REACHED',
        used,
        limit: limits.applications,
        plan,
      });
    }

    // Fixed: String() cast, userId camelCase
    const jobId = String(job_id);

    // Fixed: findFirst uses camelCase
    const existing = await prisma.application.findFirst({
      where: { userId: req.user.id, jobId },
    });
    if (existing) return res.status(409).json({ error: 'Already applied to this job' });

    const [profile, job] = await Promise.all([
      prisma.profile.findUnique({ where: { userId: req.user.id } }),
      prisma.job.findUnique({ where: { id: jobId }, include: { company: { select: { name: true } } } }),
    ]);

    if (!profile) return res.status(404).json({ error: 'Profile not found. Upload your CV first.' });
    if (!job)     return res.status(404).json({ error: 'Job not found' });

    const flatJob = { ...job, company: job.company?.name || '' };

    // Generate cover letter
    let coverLetterId = null;
    try {
      const coverLetterText = await aiService.generateCoverLetter(profile, flatJob);
      const cl = await prisma.coverLetter.create({
        data: { userId: req.user.id, jobId, company: flatJob.company, title: `Auto — ${job.title}`, content: coverLetterText },
      });
      coverLetterId = cl.id;
    } catch (e) {
      console.error('Cover letter generation failed (non-fatal):', e.message);
    }

    // Fixed: camelCase fields, 'APPLIED' uppercase enum
    const application = await prisma.application.create({
      data: {
        userId:               req.user.id,
        jobId,
        status:               'APPLIED',
        appliedAt:            new Date(),
        appliedAutomatically: true,
        ...(coverLetterId && { coverLetterId }),
      },
    });

    await deductUsage(req.user.id, 'applications');

    res.json({
      message:        'Application submitted successfully',
      application_id: application.id,
      job_title:      job.title,
      company:        flatJob.company,
    });
  } catch (err) {
    console.error('Auto-apply error:', err.message);
    res.status(500).json({ error: 'Auto-apply failed' });
  }
});

module.exports = router;