// routes/jobs.js
// Fixed: new PrismaClient() → shared singleton
// Fixed: isActive → status: 'ACTIVE' (Job schema uses JobStatus enum)
// Fixed: id: Number() → id: String() (Prisma uses cuid strings)
// Fixed: company is a Company relation — include company: { select: { name: true } }
// Fixed: role check uses lowercase (req.user.role is normalized in auth.js)
const express = require('express');
const prisma  = require('../confiq/prisma');
const { auth } = require('../middleware/auth');
const matchingService = require('../services/matchingService');

const router = express.Router();

// Helper — flatten company relation to string for API response compatibility
const fmtJob = (j) => ({
  id:           j.id,
  title:        j.title,
  company:      j.company?.name || (typeof j.company === 'string' ? j.company : ''),
  location:     j.location || '',
  remote:       j.remoteType === 'REMOTE' ? 1 : 0,
  description:  j.description,
  requirements: j.requirements,
  salary:       j.salaryMin && j.salaryMax ? `${j.currency || 'KES'} ${j.salaryMin} - ${j.salaryMax}` : null,
  applyEmail:   j.applyEmail,
  applyUrl:     j.applyUrl,
  source:       j.source,
  is_active:    j.status === 'ACTIVE' ? 1 : 0,
  created_at:   j.createdAt,
});

// GET /api/jobs
router.get('/', auth, async (req, res) => {
  try {
    const { limit = 50, offset = 0, location, remote } = req.query;

    const jobs = await prisma.job.findMany({
      where: {
        status: 'ACTIVE',
        ...(location && { location: { contains: location, mode: 'insensitive' } }),
        ...(remote === 'true' && { remoteType: 'REMOTE' }),
      },
      include: { company: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      skip:    Number(offset),
      take:    Number(limit),
    });

    res.json(jobs.map(fmtJob));
  } catch (err) {
    console.error('Jobs fetch error:', err.message);
    res.status(500).json({ error: 'Failed to fetch jobs' });
  }
});

// GET /api/jobs/matches
router.get('/matches', auth, async (req, res) => {
  try {
    const profile = await prisma.profile.findUnique({ where: { userId: req.user.id } });
    if (!profile) return res.status(404).json({ error: 'Profile not found. Please upload your CV.' });

    const jobs = await prisma.job.findMany({
      where:   { status: 'ACTIVE' },
      include: { company: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take:    200,
    });

    const flatJobs = jobs.map(j => ({ ...j, company: j.company?.name || '' }));
    const matches  = await matchingService.matchJobsToProfile(profile, flatJobs);

    res.json(matches);
  } catch (err) {
    console.error('Match error:', err.message);
    res.status(500).json({ error: 'Matching failed' });
  }
});

// GET /api/jobs/:id
router.get('/:id', auth, async (req, res) => {
  try {
    const job = await prisma.job.findUnique({
      where:   { id: String(req.params.id) },
      include: { company: { select: { name: true } } },
    });
    if (!job) return res.status(404).json({ error: 'Job not found' });
    res.json(fmtJob(job));
  } catch (err) {
    console.error('Job fetch error:', err.message);
    res.status(500).json({ error: 'Failed to fetch job' });
  }
});

// POST /api/jobs — admin only
router.post('/', auth, async (req, res) => {
  try {
    if (!['admin', 'super_admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Admin only' });
    }

    const { title, company, location, remote, description, requirements,
            salary, job_url, apply_email, apply_url, source } = req.body;

    if (!title || !company) return res.status(400).json({ error: 'Title and company required' });

    let companyRecord = await prisma.company.findFirst({ where: { name: company } });
    if (!companyRecord) {
      companyRecord = await prisma.company.create({ data: { name: company } });
    }

    const job = await prisma.job.create({
      data: {
        companyId:      companyRecord.id,
        title,
        location:       location     || '',
        remoteType:     remote ? 'REMOTE' : 'ONSITE',
        description:    description  || '',
        requirements:   requirements || '',
        applyEmail:     apply_email  || '',
        applyUrl:       apply_url    || job_url || '',
        source:         source       || 'admin',
        status:         'ACTIVE',
        employmentType: 'FULL_TIME',
      },
    });

    res.status(201).json({ id: job.id, message: 'Job added' });
  } catch (err) {
    console.error('Job create error:', err.message);
    res.status(500).json({ error: 'Failed to create job' });
  }
});

module.exports = router;