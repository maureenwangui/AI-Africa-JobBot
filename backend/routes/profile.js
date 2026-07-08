// routes/profile.js
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
const { auth } = require('../middleware/auth');
const aiService = require('../services/aiService');

const router = express.Router();

// Use a shared Prisma singleton — move to lib/prisma.js if needed
const prisma = new PrismaClient();

// Multer config for CV uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../uploads/cvs');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `cv_${req.user.id}_${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.doc', '.docx'];
    if (!allowed.includes(path.extname(file.originalname).toLowerCase())) {
      return cb(new Error('Only PDF and Word documents allowed'));
    }
    cb(null, true);
  },
});

// GET /api/profile
router.get('/', auth, async (req, res) => {
  try {
    const profile = await prisma.profile.findUnique({
      where: { user_id: req.user.id },
    });

    if (!profile) return res.status(404).json({ error: 'Profile not found' });

    // Prisma + PostgreSQL Json fields are returned as native JS objects/arrays —
    // no manual JSON.parse needed (unlike better-sqlite3 which stores raw strings).
    res.json(profile);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Failed to fetch profile' });
  }
});

// PUT /api/profile — update profile fields
router.put('/', auth, async (req, res) => {
  try {
    const {
      skills,
      experience,
      education,
      keywords,
      preferred_roles,
      preferred_location,
      remote_preference,
      summary,
    } = req.body;

    await prisma.profile.update({
      where: { user_id: req.user.id },
      data: {
        skills:             skills             ?? [],
        experience:         experience         ?? [],
        education:          education          ?? [],
        keywords:           keywords           ?? [],
        preferred_roles:    preferred_roles    ?? [],
        preferred_location: preferred_location ?? null,
        // PostgreSQL uses a native Boolean — no more 0/1 coercion
        remote_preference:  Boolean(remote_preference),
        summary:            summary            ?? null,
        // Omit this line if your schema has @updatedAt — Prisma sets it automatically
        updated_at:         new Date(),
      },
    });

    res.json({ message: 'Profile updated' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Failed to update profile' });
  }
});

// POST /api/profile/upload-cv
router.post('/upload-cv', auth, upload.single('cv'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const filename = req.file.filename;

    // Use AI to extract CV data
    let extracted = {};
    try {
      extracted = await aiService.extractCvData(req.file.path);
    } catch (e) {
      console.error('AI extraction failed, using filename:', e.message);
    }

    await prisma.profile.update({
      where: { user_id: req.user.id },
      data: {
        cv_filename: filename,
        // Pass arrays/objects directly — Prisma serialises to JSONB automatically
        skills:      extracted.skills      || [],
        experience:  extracted.experience  || [],
        education:   extracted.education   || [],
        keywords:    extracted.keywords    || [],
        summary:     extracted.summary     || '',
        updated_at:  new Date(),
      },
    });

    res.json({
      message: 'CV uploaded and parsed successfully',
      filename,
      extracted,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'CV upload failed' });
  }
});

module.exports = router;