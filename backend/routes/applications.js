// routes/applications.js
// Fixed: new PrismaClient() → shared singleton
// Fixed: status values → Prisma ApplicationStatus uppercase enums (APPLIED, QUEUED, VIEWED, INTERVIEW, REJECTED, HIRED)
// Fixed: jobId: Number() → jobId: String() (cuid)
// Fixed: coverLetter field does not exist — Application has coverLetterId relation
// Fixed: job.company is a relation — include company: { select: { name: true } }
// Fixed: STATS route status filters → uppercase
const express = require('express');
const prisma  = require('../confiq/prisma');
const { auth } = require('../middleware/auth');
const notificationService = require('../services/notificationService');

const router = express.Router();

// Status map — frontend sends lowercase, Prisma expects uppercase
const STATUS_UP = {
  queued:    'QUEUED',
  sent:      'APPLIED',
  applied:   'APPLIED',
  viewed:    'VIEWED',
  interview: 'INTERVIEW',
  rejected:  'REJECTED',
  hired:     'HIRED',
};

// GET /api/applications
router.get('/', auth, async (req, res) => {
  try {
    const apps = await prisma.application.findMany({
      where:   { userId: req.user.id },
      include: {
        job: {
          select: {
            title:    true,
            location: true,
            company:  { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take:    100,
    });

    res.json(apps.map(a => ({
      id:          a.id,
      user_id:     a.userId,
      job_id:      a.jobId,
      status:      a.status.toLowerCase(),
      match_score: a.matchScore,
      created_at:  a.createdAt,
      applied_at:  a.appliedAt,
      job_title:   a.job?.title           || '',
      company:     a.job?.company?.name   || '',
      location:    a.job?.location        || '',
    })));
  } catch (err) {
    console.error('Applications fetch error:', err.message);
    res.status(500).json({ error: 'Failed to fetch applications' });
  }
});

// GET /api/applications/stats
router.get('/stats', auth, async (req, res) => {
  try {
    const [total, sent, viewed, interview] = await Promise.all([
      prisma.application.count({ where: { userId: req.user.id } }),
      // Fixed: uppercase enum values
      prisma.application.count({ where: { userId: req.user.id, status: 'APPLIED'    } }),
      prisma.application.count({ where: { userId: req.user.id, status: 'VIEWED'     } }),
      prisma.application.count({ where: { userId: req.user.id, status: 'INTERVIEW'  } }),
    ]);
    res.json({ total, sent, viewed, interview });
  } catch (err) {
    console.error('Stats error:', err.message);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

// POST /api/applications
router.post('/', auth, async (req, res) => {
  try {
    const { job_id, cover_letter } = req.body;
    if (!job_id) return res.status(400).json({ error: 'job_id required' });

    // Fixed: String() not Number()
    const jobId = String(job_id);

    const existing = await prisma.application.findFirst({
      where: { userId: req.user.id, jobId },
    });
    if (existing) return res.status(409).json({ error: 'Already applied' });

    // Save cover letter to CoverLetter table first if provided
    let coverLetterId = null;
    if (cover_letter) {
      const cl = await prisma.coverLetter.create({
        data: {
          userId:  req.user.id,
          jobId,
          content: cover_letter,
        },
      });
      coverLetterId = cl.id;
    }

    const application = await prisma.application.create({
      data: {
        userId:    req.user.id,
        jobId,
        // Fixed: 'APPLIED' uppercase enum (not 'sent')
        status:    'APPLIED',
        appliedAt: new Date(),
        ...(coverLetterId && { coverLetterId }),
      },
    });

    // Fetch job for notification
    const job = await prisma.job.findUnique({
      where:   { id: jobId },
      include: { company: { select: { name: true } } },
    });

    if (notificationService?.sendApplicationAlert && job) {
      notificationService.sendApplicationAlert(req.user, {
        title:   job.title,
        company: job.company?.name || '',
      }).catch(console.error);
    }

    res.status(201).json({ id: application.id, message: 'Application submitted' });
  } catch (err) {
    console.error('Application error:', err.message);
    res.status(500).json({ error: 'Application failed' });
  }
});

// PATCH /api/applications/:id/status
router.patch('/:id/status', auth, async (req, res) => {
  try {
    const { status } = req.body;
    // Map lowercase input to Prisma uppercase enum
    const prismaStatus = STATUS_UP[status?.toLowerCase()];
    if (!prismaStatus) return res.status(400).json({ error: 'Invalid status' });

    await prisma.application.updateMany({
      where: { id: String(req.params.id), userId: req.user.id },
      data:  { status: prismaStatus },
    });
    res.json({ message: 'Updated' });
  } catch (err) {
    console.error('Status update error:', err.message);
    res.status(500).json({ error: 'Update failed' });
  }
});

module.exports = router;