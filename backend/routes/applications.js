const express = require("express");
const { PrismaClient } = require("@prisma/client");
const { auth } = require("../middleware/auth");
const notificationService = require("../services/notificationService");

const prisma = new PrismaClient();
const router = express.Router();

// GET all applications
router.get("/", auth, async (req, res) => {
  try {
    const apps = await prisma.application.findMany({
      where: {
        userId: req.user.id,
      },
      include: {
        job: {
          select: {
            title: true,
            company: true,
            location: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 100,
    });

    res.json(apps);
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "Failed to fetch applications",
    });
  }
});

// STATS
router.get("/stats", auth, async (req, res) => {
  try {
    const total = await prisma.application.count({
      where: { userId: req.user.id },
    });

    const sent = await prisma.application.count({
      where: {
        userId: req.user.id,
        status: "sent",
      },
    });

    const viewed = await prisma.application.count({
      where: {
        userId: req.user.id,
        status: "viewed",
      },
    });

    const interview = await prisma.application.count({
      where: {
        userId: req.user.id,
        status: "interview",
      },
    });

    res.json({
      total,
      sent,
      viewed,
      interview,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "Failed to fetch statistics",
    });
  }
});

// APPLY
router.post("/", auth, async (req, res) => {
  try {
    const { job_id, cover_letter } = req.body;

    if (!job_id) {
      return res.status(400).json({
        error: "job_id required",
      });
    }

    const existing = await prisma.application.findFirst({
      where: {
        userId: req.user.id,
        jobId: Number(job_id),
      },
    });

    if (existing) {
      return res.status(409).json({
        error: "Already applied",
      });
    }

    const application = await prisma.application.create({
      data: {
        userId: req.user.id,
        jobId: Number(job_id),
        status: "sent",
        coverLetter: cover_letter || "",
        appliedAt: new Date(),
      },
    });

    const job = await prisma.job.findUnique({
      where: {
        id: Number(job_id),
      },
      select: {
        title: true,
        company: true,
      },
    });

    if (notificationService?.sendApplicationAlert && job) {
      await notificationService.sendApplicationAlert(req.user, job);
    }

    res.status(201).json({
      id: application.id,
      message: "Application submitted",
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "Application failed",
    });
  }
});

// UPDATE STATUS
router.patch("/:id/status", auth, async (req, res) => {
  try {
    const { status } = req.body;

    const valid = [
      "queued",
      "sent",
      "viewed",
      "interview",
      "rejected",
      "hired",
    ];

    if (!valid.includes(status)) {
      return res.status(400).json({
        error: "Invalid status",
      });
    }

    await prisma.application.updateMany({
      where: {
        id: Number(req.params.id),
        userId: req.user.id,
      },
      data: {
        status,
        updatedAt: new Date(),
      },
    });

    res.json({
      message: "Updated",
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "Update failed",
    });
  }
});

module.exports = router;