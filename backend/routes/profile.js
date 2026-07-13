// routes/profile.js — Migrated from SQLite to Prisma + Cloudinary CV storage
// SQLite replaced:
//   getDb() + db.prepare('SELECT * FROM profiles WHERE user_id = ?').get()
//   → prisma.profile.findUnique({ where: { userId } })
//
//   db.prepare('UPDATE profiles SET skills = ?, ... WHERE user_id = ?').run()
//   → prisma.profile.upsert({ where: { userId }, update: { ... }, create: { ... } })
//
//   db.prepare('UPDATE profiles SET cv_filename = ?, ... WHERE user_id = ?').run()
//   → prisma.profile.upsert + prisma.resume.create with Cloudinary CDN URL

const express    = require('express');
const multer     = require('multer');
const path       = require('path');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const prisma     = require('../confiq/prisma');
const { auth }   = require('../middleware/auth');

const router = express.Router();

// ── Cloudinary config — reads from .env ──────────────────────────────────────
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ── Multer + Cloudinary storage ───────────────────────────────────────────────
const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => ({
    folder:        `africa-jobbot/cvs/user_${req.user.id}`,
    public_id:     `cv_${req.user.id}_${Date.now()}`,
    resource_type: 'raw',  // raw = non-image files (PDF, DOCX, DOC)
    format:        path.extname(file.originalname).slice(1).toLowerCase(),
  }),
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
router.get('/', auth, async (req, res) => {
  try {
    const [profile, latestResume] = await Promise.all([
      prisma.profile.findUnique({ where: { userId: String(req.user.id) } }),
      prisma.resume.findFirst({
        where:   { userId: String(req.user.id) },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const parseField = (val) => {
      if (!val) return val;
      try { return JSON.parse(val); } catch { return val; }
    };

    res.json({
      id:                 profile.id,
      user_id:            profile.userId,
      cv_filename:        latestResume?.originalName  || null,
      cv_url:             latestResume?.fileUrl        || null,
      skills:             parseField(profile.skills),
      experience:         parseField(profile.experience),
      education:          parseField(profile.education),
      keywords:           [],
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
router.put('/', auth, async (req, res) => {
  try {
    const {
      skills,
      experience,
      education,
      preferred_roles,
      preferred_location,
      remote_preference,
      summary,
      headline,
      linkedin,
      github,
      portfolio,
    } = req.body;

    const data = {
      skills:             skills          ? JSON.stringify(skills)          : undefined,
      experience:         experience      ? JSON.stringify(experience)      : undefined,
      education:          education       ? JSON.stringify(education)       : undefined,
      preferredRoles:     preferred_roles ? JSON.stringify(preferred_roles) : undefined,
      preferredLocations: preferred_location ?? undefined,
      remotePreference:   remote_preference !== undefined ? !!remote_preference : undefined,
      summary:            summary   ?? undefined,
      headline:           headline  ?? undefined,
      linkedin:           linkedin  ?? undefined,
      github:             github    ?? undefined,
      portfolio:          portfolio ?? undefined,
    };

    Object.keys(data).forEach(k => data[k] === undefined && delete data[k]);

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
// Cloudinary uploads the file and sets req.file.path = permanent CDN URL
// req.file.filename = public_id on Cloudinary
router.post('/upload-cv', auth, upload.single('cv'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    // Cloudinary provides the permanent CDN URL in req.file.path
    const cloudUrl      = req.file.path;       // e.g. https://res.cloudinary.com/your-cloud/raw/upload/...
    const originalName  = req.file.originalname;
    const fileSize      = req.file.size;
    const fileType      = path.extname(originalName).slice(1).toLowerCase();

    // Skill extraction via keyword matching
    // Note: extractedText is empty for binary PDF/DOCX — add pdf-parse later for full extraction
    const skillList = [
      'project management',
      'monitoring and evaluation',
      'budgeting',
      'report writing',
      'microsoft excel',
      'microsoft word',
      'communication',
      'leadership',
      'data analysis',
    ];
    // For now skills will be empty until pdf-parse is added
    // Text extraction from PDF/DOCX requires pdf-parse / mammoth packages
    const extractedSkills = [];

    // 1 — Save skills to profile
    await prisma.profile.upsert({
      where:  { userId: String(req.user.id) },
      update: {
        skills: extractedSkills.length > 0
          ? extractedSkills.join(', ')
          : undefined,
      },
      create: {
        userId: String(req.user.id),
        skills: extractedSkills.join(', '),
      },
    });

    // 2 — Save resume record with permanent Cloudinary URL
    const resume = await prisma.resume.create({
      data: {
        userId:             String(req.user.id),
        originalName:       originalName,
        fileUrl:            cloudUrl,        // ← permanent Cloudinary CDN URL, never breaks on redeploy
        fileSize:           fileSize,
        mimeType:           fileType,
        parsedSuccessfully: false,
        uploadSource:       'profile',
      },
    });

    res.json({
      message:   'CV uploaded successfully',
      filename:  originalName,
      file_url:  cloudUrl,
      resume_id: resume.id,
      skills:    extractedSkills,
    });

  } catch (err) {
    console.error('CV upload error:', err.message);
    res.status(500).json({ error: err.message || 'CV upload failed' });
  }
});

module.exports = router;