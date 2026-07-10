// routes/profile.js — Migrated from SQLite to Prisma
// SQLite replaced:
//   getDb() + db.prepare('SELECT * FROM profiles WHERE user_id = ?').get()
//   → prisma.profile.findUnique({ where: { userId } })
//
//   db.prepare('UPDATE profiles SET skills = ?, ... WHERE user_id = ?').run()
//   → prisma.profile.update({ where: { userId }, data: { ... } })
//
//   db.prepare('UPDATE profiles SET cv_filename = ?, ... WHERE user_id = ?').run()
//   → prisma.profile.upsert({ where: { userId }, update: { ... }, create: { ... } })

const express    = require('express');
const multer     = require('multer');
const path       = require('path');
const fs         = require('fs');
const prisma     = require('../confiq/prisma');
const { auth }   = require('../middleware/auth');
const aiService  = require('../services/aiService');

const router = express.Router();

// ── Multer config (unchanged — file upload logic stays the same) ──────────────
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

// ── GET /api/profile ──────────────────────────────────────────────────────────
// Replaced: db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(req.user.id)
// With:     prisma.profile.findUnique({ where: { userId } })
router.get('/', auth, async (req, res) => {
  try {
    const profile = await prisma.profile.findUnique({
      where: { userId: String(req.user.id) },
    });

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    // Parse JSON fields — same as before
    // Prisma returns strings stored as JSON, parse them for the response
    const parseField = (val) => {
      if (!val) return val;
      try { return JSON.parse(val); } catch { return val; }
    };

    // Map Prisma camelCase → snake_case to preserve API response shape
    res.json({
      id:                 profile.id,
      user_id:            profile.userId,
      cv_filename:        profile.cvFilename,
      skills:             parseField(profile.skills),
      experience:         parseField(profile.experience),
      education:          parseField(profile.education),
      keywords:           parseField(profile.keywords),
      preferred_roles:    parseField(profile.preferredRoles),
      preferred_location: profile.preferredLocations,
      remote_preference:  profile.remotePreference ? 1 : 0,
      summary:            profile.summary,
      headline:           profile.headline,
      linkedin:           profile.linkedin,
      github:             profile.github,
      portfolio:          profile.portfolio,
      profile_score:      profile.profileScore,
      created_at:         profile.createdAt,
      updated_at:         profile.updatedAt,
    });

  } catch (err) {
    console.error('Get profile error:', err.message);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// ── PUT /api/profile ──────────────────────────────────────────────────────────
// Replaced:
//   db.prepare('UPDATE profiles SET skills = ?, ... WHERE user_id = ?').run(...)
// With:
//   prisma.profile.upsert({ where: { userId }, update: { ... }, create: { ... } })
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
      headline,
      linkedin,
      github,
      portfolio,
    } = req.body;

    // Store arrays as JSON strings — same as SQLite behaviour
    const data = {
      skills:             skills          ? JSON.stringify(skills)          : undefined,
      experience:         experience      ? JSON.stringify(experience)      : undefined,
      education:          education       ? JSON.stringify(education)       : undefined,
      keywords:           keywords        ? JSON.stringify(keywords)        : undefined,
      preferredRoles:     preferred_roles ? JSON.stringify(preferred_roles) : undefined,
      preferredLocations: preferred_location ?? undefined,
      remotePreference:   remote_preference !== undefined ? !!remote_preference : undefined,
      summary:            summary   ?? undefined,
      headline:           headline  ?? undefined,
      linkedin:           linkedin  ?? undefined,
      github:             github    ?? undefined,
      portfolio:          portfolio ?? undefined,
    };

    // Remove undefined fields
    Object.keys(data).forEach(k => data[k] === undefined && delete data[k]);

    // upsert — create profile if it doesn't exist yet
    await prisma.profile.upsert({
      where:  { userId: String(req.user.id) },
      update: data,
      create: { userId: String(req.user.id), ...data },
    });

    res.json({ message: 'Profile updated' });

  } catch (err) {
    console.error('Update profile error:', err.message);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// ── POST /api/profile/upload-cv ───────────────────────────────────────────────
// Replaced:
//   db.prepare('UPDATE profiles SET cv_filename = ?, skills = ?, ... WHERE user_id = ?').run(...)
// With:
//   prisma.profile.upsert({ where: { userId }, update: { cvFilename, skills, ... }, create: { ... } })
router.post('/upload-cv', auth, upload.single('cv'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const filename = req.file.filename;

    // AI extraction (unchanged — same service call)
    let extracted = {};
    try {
      extracted = await aiService.extractCvData(req.file.path);
    } catch (e) {
      console.error('AI extraction failed:', e.message);
    }

    // Replaced: db.prepare('UPDATE profiles SET cv_filename = ?, skills = ?, ... WHERE user_id = ?').run(...)
    await prisma.profile.upsert({
      where:  { userId: String(req.user.id) },
      update: {
        cvFilename:  filename,
        skills:      JSON.stringify(extracted.skills      || []),
        experience:  JSON.stringify(extracted.experience  || []),
        education:   JSON.stringify(extracted.education   || []),
        keywords:    JSON.stringify(extracted.keywords    || []),
        summary:     extracted.summary || '',
      },
      create: {
        userId:      String(req.user.id),
        cvFilename:  filename,
        skills:      JSON.stringify(extracted.skills      || []),
        experience:  JSON.stringify(extracted.experience  || []),
        education:   JSON.stringify(extracted.education   || []),
        keywords:    JSON.stringify(extracted.keywords    || []),
        summary:     extracted.summary || '',
      },
    });

    res.json({
      message:   'CV uploaded and parsed successfully',
      filename,
      extracted,
    });

  } catch (err) {
    console.error('CV upload error:', err.message);
    res.status(500).json({ error: err.message || 'CV upload failed' });
  }
});

module.exports = router;