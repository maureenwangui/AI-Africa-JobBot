const express = require("express");
const { auth } = require("../middleware/auth");
const notificationService = require("../services/notificationService");

const prisma = require('../confiq/prisma');
const router = express.Router();

// Flatten `job.company` (a Company relation) down to its name string so
// clients get the same simple shape they always have.
function flattenJob(app) {
  if (!app.job) return app;
  return {
    ...app,
    job: {
      title:    app.job.title,
      location: app.job.location,
      company:  app.job.company?.name || null,
    },
  };
}

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
            location: true,
            company: { select: { name: true } },
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 100,
    });

    res.json(apps.map(flattenJob));
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
        status: "APPLIED",
      },
    });

    const viewed = await prisma.application.count({
      where: {
        userId: req.user.id,
        status: "VIEWED",
      },
    });

    const interview = await prisma.application.count({
      where: {
        userId: req.user.id,
        status: "INTERVIEW",
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
        jobId: job_id,
      },
    });

    if (existing) {
      return res.status(409).json({
        error: "Already applied",
      });
    }

    const job = await prisma.job.findUnique({
      where: {
        id: job_id,
      },
      include: {
        company: { select: { name: true } },
      },
    });

    if (!job) {
      return res.status(404).json({
        error: "Job not found",
      });
    }

    // Application.coverLetter is a relation (coverLetterId), not free text —
    // create a CoverLetter row first if the user supplied text.
    let coverLetterId = null;
    if (cover_letter) {
      const created = await prisma.coverLetter.create({
        data: {
          userId:      req.user.id,
          jobId:       job.id,
          companyName: job.company?.name || null,
          content:     cover_letter,
        },
      });
      coverLetterId = created.id;
    }

    const application = await prisma.application.create({
      data: {
        userId: req.user.id,
        jobId: job.id,
        status: "APPLIED",
        coverLetterId,
        appliedAt: new Date(),
      },
    });

    if (notificationService?.sendApplicationAlert) {
      await notificationService.sendApplicationAlert(req.user, {
        title: job.title,
        company: job.company?.name || "the company",
      });
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

    // Map the client's friendly lowercase status to the real enum value.
    const statusMap = {
      queued:    "QUEUED",
      sent:      "APPLIED",
      viewed:    "VIEWED",
      interview: "INTERVIEW",
      rejected:  "REJECTED",
      hired:     "HIRED",
    };

    const mapped = statusMap[status];

    if (!mapped) {
      return res.status(400).json({
        error: "Invalid status",
      });
    }

    await prisma.application.updateMany({
      where: {
        id: req.params.id,
        userId: req.user.id,
      },
      data: {
        status: mapped,
        updatedAt: new Date(),
        ...(mapped === "VIEWED" ? { viewedAt: new Date() } : {}),
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