// routes/jobs.js
const express = require("express");
const { PrismaClient } = require("@prisma/client");
const { auth } = require("../middleware/auth");
const matchingService = require("../services/matchingService");

const prisma = new PrismaClient();
const router = express.Router();

// GET /api/jobs
router.get("/", auth, async (req, res) => {
  try {
    const { limit = 50, offset = 0, location, remote } = req.query;

    const jobs = await prisma.job.findMany({
      where: {
        isActive: true,
        ...(location && {
          location: {
            contains: location,
            mode: "insensitive",
          },
        }),
        ...(remote === "true" && {
          remote: true,
        }),
      },
      orderBy: {
        createdAt: "desc",
      },
      skip: Number(offset),
      take: Number(limit),
    });

    res.json(jobs);
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
        isActive: true,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 200,
    });

    const matches = await matchingService.matchJobsToProfile(profile, jobs);

    res.json(matches);
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
        id: Number(req.params.id),
      },
    });

    if (!job) {
      return res.status(404).json({
        error: "Job not found",
      });
    }

    res.json(job);
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "Failed to fetch job",
    });
  }
});

// POST /api/jobs
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
      remote,
      description,
      requirements,
      salary,
      job_url,
      apply_email,
      apply_url,
      source,
    } = req.body;

    const job = await prisma.job.create({
      data: {
        title,
        company,
        location,
        remote: !!remote,
        description,
        requirements,
        salary,
        jobUrl: job_url,
        applyEmail: apply_email,
        applyUrl: apply_url,
        source,
        isActive: true,
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