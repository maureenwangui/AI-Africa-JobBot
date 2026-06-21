// routes/profile.js
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const getDb = require('../db/connection');
const { auth } = require('../middleware/auth');
const aiService = require('../services/aiService');

const router = express.Router();

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
router.get('/', auth, (req, res) => {
  const db = getDb();
  const profile = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(req.user.id);
  if (!profile) return res.status(404).json({ error: 'Profile not found' });

  // Parse JSON fields
  ['skills', 'experience', 'education', 'keywords', 'preferred_roles'].forEach(f => {
    try { if (profile[f]) profile[f] = JSON.parse(profile[f]); } catch {}
  });

  res.json(profile);
});

// PUT /api/profile — update profile fields
router.put('/', auth, (req, res) => {
  const db = getDb();
  const { skills, experience, education, keywords, preferred_roles, preferred_location, remote_preference, summary } = req.body;

  db.prepare(`
    UPDATE profiles SET
      skills = ?, experience = ?, education = ?, keywords = ?,
      preferred_roles = ?, preferred_location = ?, remote_preference = ?,
      summary = ?, updated_at = datetime('now')
    WHERE user_id = ?
  `).run(
    JSON.stringify(skills), JSON.stringify(experience),
    JSON.stringify(education), JSON.stringify(keywords),
    JSON.stringify(preferred_roles), preferred_location,
    remote_preference ? 1 : 0, summary, req.user.id
  );

  res.json({ message: 'Profile updated' });
});

// POST /api/profile/upload-cv
router.post('/upload-cv', auth, upload.single('cv'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const db = getDb();
    const filename = req.file.filename;

    // Use AI to extract CV data
    let extracted = {};
    try {
      extracted = await aiService.extractCvData(req.file.path);
    } catch (e) {
      console.error('AI extraction failed, using filename:', e.message);
    }

    db.prepare(`
      UPDATE profiles SET
        cv_filename = ?,
        skills = ?,
        experience = ?,
        education = ?,
        keywords = ?,
        summary = ?,
        updated_at = datetime('now')
      WHERE user_id = ?
    `).run(
      filename,
      JSON.stringify(extracted.skills || []),
      JSON.stringify(extracted.experience || []),
      JSON.stringify(extracted.education || []),
      JSON.stringify(extracted.keywords || []),
      extracted.summary || '',
      req.user.id
    );

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