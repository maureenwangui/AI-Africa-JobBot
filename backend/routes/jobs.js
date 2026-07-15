// routes/jobs.js
const express = require("express");
const { auth } = require("../middleware/auth");
const matchingService = require("../services/matchingService");

const prisma = require('../confiq/prisma');
const router = express.Router();

// Flatten `job.company` (a Company relation) down to its name string.
function flattenJob(job) {
  if (!job || !("company" in job)) return job;
  return { ...job, company: job.company?.name || null };
}

// GET /api/jobs
router.get("/", auth, async (req, res) => {
  try {
    const { limit = 50, offset = 0, location, remote } = req.query;

    const jobs = await prisma.job.findMany({
      where: {
        status: "ACTIVE",
        ...(location && {
          location: {
            contains: location,
            mode: "insensitive",
          },
        }),
        ...(remote === "true" && {
          remoteType: "REMOTE",
        }),
      },
      include: {
        company: { select: { name: true } },
      },
      orderBy: {
        createdAt: "desc",
      },
      skip: Number(offset),
      take: Number(limit),
    });

    res.json(jobs.map(flattenJob));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch jobs" });
  }
});

// GET /api/jobs/matches
router.get("/matches", auth, async (req, res) => {
  try {
    const profile = await prisma.profile.findUnique({
      where: {
        userId: req.user.id,
      },
    });

    if (!profile) {
      return res.status(404).json({
        error: "Profile not found. Please upload your CV.",
      });
    }

    const jobs = await prisma.job.findMany({
      where: {
        status: "ACTIVE",
      },
      include: {
        company: { select: { name: true } },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 200,
    });

    const matches = await matchingService.matchJobsToProfile(profile, jobs);

    res.json(matches.map(flattenJob));
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "Matching failed",
    });
  }
});

// GET /api/jobs/:id
router.get("/:id", auth, async (req, res) => {
  try {
    const job = await prisma.job.findUnique({
      where: {
        id: req.params.id,
      },
      include: {
        company: true,
      },
    });

    if (!job) {
      return res.status(404).json({
        error: "Job not found",
      });
    }

    res.json(flattenJob(job));
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "Failed to fetch job",
    });
  }
});

// POST /api/jobs — admin only
router.post("/", auth, async (req, res) => {
  try {
    if (
      req.user.role !== "ADMIN" &&
      req.user.role !== "SUPER_ADMIN"
    ) {
      return res.status(403).json({
        error: "Admin only",
      });
    }

    const {
      title,
      company,
      location,
      remote_type = "ONSITE",       // REMOTE | HYBRID | ONSITE
      employment_type = "FULL_TIME", // FULL_TIME | PART_TIME | CONTRACT | INTERNSHIP | FREELANCE | TEMPORARY
      description,
      requirements,
      salary_min,
      salary_max,
      apply_url,
      source,
    } = req.body;

    if (!title || !company || !description) {
      return res.status(400).json({ error: "title, company and description are required" });
    }

    // Company is a relation, not a plain string — find or create it.
    const companyRecord = await prisma.company.upsert({
      where:  { name: company },
      update: {},
      create: { name: company },
    });

    const job = await prisma.job.create({
      data: {
        title,
        companyId: companyRecord.id,
        location,
        remoteType: remote_type,
        employmentType: employment_type,
        description,
        requirements,
        salaryMin: salary_min ? Number(salary_min) : null,
        salaryMax: salary_max ? Number(salary_max) : null,
        applyUrl: apply_url,
        source,
        status: "ACTIVE",
      },
    });

    res.status(201).json({
      id: job.id,
      message: "Job added",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "Failed to create job",
    });
  }
});

module.exports = router;