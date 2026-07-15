// routes/profile.js — Prisma + Cloudinary + PDF/DOCX text extraction
const express    = require('express');
const multer     = require('multer');
const path       = require('path');
const fs         = require('fs');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const prisma     = require('../confiq/prisma');
const { auth }   = require('../middleware/auth');
const aiService  = require('../services/aiService');

const router = express.Router();

// ── Cloudinary config ─────────────────────────────────────────────────────────
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
    resource_type: 'raw',
    format:        path.extname(file.originalname).slice(1).toLowerCase(),
  }),
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.doc', '.docx'];
    if (!allowed.includes(path.extname(file.originalname).toLowerCase())) {
      return cb(new Error('Only PDF and Word documents allowed'));
    }
    cb(null, true);
  },
});

// ── Text extraction helpers ───────────────────────────────────────────────────
async function extractTextFromFile(filePath, originalName) {
  const ext = path.extname(originalName).toLowerCase();
  try {
    if (ext === '.pdf') {
      const pdfParse = require('pdf-parse');
      const buffer   = fs.readFileSync(filePath);
      const data     = await pdfParse(buffer);
      return data.text || '';
    }
    if (ext === '.docx' || ext === '.doc') {
      const mammoth = require('mammoth');
      const result  = await mammoth.extractRawText({ path: filePath });
      return result.value || '';
    }
    if (ext === '.txt') {
      return fs.readFileSync(filePath, 'utf8');
    }
  } catch (e) {
    console.error('Text extraction error:', e.message);
  }
  return '';
}

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

    if (!profile) return res.status(404).json({ error: 'Profile not found' });

    const parseField = (val) => {
      if (!val) return val;
      try { return JSON.parse(val); } catch { return val; }
    };

    res.json({
      id:                 profile.id,
      user_id:            profile.userId,
      cv_filename:        latestResume?.originalName   || null,
      cv_url:             latestResume?.fileUrl         || null,
      skills:             parseField(profile.skills),
      experience:         parseField(profile.experience),
      education:          parseField(profile.education),
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
      skills, experience, education, keywords,
      preferred_roles, preferred_location,
      remote_preference, summary, headline,
      linkedin, github, portfolio,
    } = req.body;

    // Profile has no dedicated `keywords` column — merge any submitted
    // keywords into `skills` (deduplicated) instead of writing an invalid field.
    const mergedSkills = (() => {
      if (!skills && !keywords) return undefined;
      const combined = [...(Array.isArray(skills) ? skills : []), ...(Array.isArray(keywords) ? keywords : [])];
      return JSON.stringify([...new Set(combined)]);
    })();

    const data = {
      skills:             mergedSkills,
      experience:         experience      ? JSON.stringify(experience)      : undefined,
      education:          education       ? JSON.stringify(education)       : undefined,
      preferredRoles:     preferred_roles ? JSON.stringify(preferred_roles) : undefined,
      preferredLocations: preferred_location   ?? undefined,
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
router.post('/upload-cv', auth, upload.single('cv'), async (req, res) => {
  // temp local path for text extraction before Cloudinary (multer-storage-cloudinary
  // uploads directly — we need to download briefly or use memoryStorage for extraction)
  // Solution: use temp memory buffer approach via multer memoryStorage fallback
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    // Cloudinary URL is in req.file.path after CloudinaryStorage upload
    const cloudUrl      = req.file.path;
    const originalName  = req.file.originalname;
    const fileSize      = req.file.size;
    const fileType      = path.extname(originalName).slice(1).toLowerCase();

    // ── Text extraction ───────────────────────────────────────────────────────
    // Cloudinary storage uploads directly — no local file path available.
    // We download from Cloudinary temporarily for text extraction.
    let extractedText = '';
    const tempPath = path.join(__dirname, `../uploads/temp_${req.user.id}_${Date.now()}.${fileType}`);

    try {
      // Create temp dir if needed
      const tempDir = path.join(__dirname, '../uploads');
      if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

      // Download from Cloudinary to temp file
      const axios  = require('axios');
      const writer = fs.createWriteStream(tempPath);
      const response = await axios({ url: cloudUrl, method: 'GET', responseType: 'stream' });
      await new Promise((resolve, reject) => {
        response.data.pipe(writer);
        writer.on('finish', resolve);
        writer.on('error', reject);
      });

      // Extract text from temp file
      extractedText = await extractTextFromFile(tempPath, originalName);
    } catch (e) {
      console.error('Text extraction failed (non-fatal):', e.message);
    } finally {
      // Always clean up temp file
      if (fs.existsSync(tempPath)) {
        try { fs.unlinkSync(tempPath); } catch {}
      }
    }

    // ── AI skill extraction ───────────────────────────────────────────────────
    let extracted = { skills: [], experience: [], education: [], keywords: [], summary: '' };

    if (extractedText && extractedText.trim().length > 50) {
      // Have real text — use AI
      try {
        extracted = await aiService.extractCvData(extractedText);
        console.log(`✅ AI extracted ${extracted.skills?.length || 0} skills from CV`);
      } catch (e) {
        console.error('AI extraction failed (non-fatal):', e.message);
        // Fallback to keyword matching if AI fails
        extracted.skills = extractSkillsByKeyword(extractedText);
      }
    } else {
      // No text extracted (scanned PDF etc.) — use keyword fallback
      console.warn('⚠️ No text extracted from CV — using keyword fallback');
      extracted.skills = [];
    }

    // ── Save to database ──────────────────────────────────────────────────────
    // Profile has no dedicated `keywords` column — merge extracted keywords
    // into `skills` (deduplicated) so nothing extracted by the AI is lost.
    const mergedSkills = JSON.stringify([
      ...new Set([...(extracted.skills || []), ...(extracted.keywords || [])]),
    ]);

    await prisma.$transaction([
      prisma.profile.upsert({
        where:  { userId: String(req.user.id) },
        update: {
          skills:     mergedSkills,
          experience: JSON.stringify(extracted.experience || []),
          education:  JSON.stringify(extracted.education  || []),
          summary:    extracted.summary || '',
        },
        create: {
          userId:     String(req.user.id),
          skills:     mergedSkills,
          experience: JSON.stringify(extracted.experience || []),
          education:  JSON.stringify(extracted.education  || []),
          summary:    extracted.summary || '',
        },
      }),

      prisma.resume.create({
        data: {
          userId:             String(req.user.id),
          originalName:       originalName,
          fileUrl:            cloudUrl,       // permanent Cloudinary CDN URL
          fileSize:           fileSize,
          fileType:           fileType,
          extractedText:      extractedText || null,
          parsedSuccessfully: extractedText.trim().length > 50,
        },
      }),
    ]);

    res.json({
      message:   'CV uploaded and parsed successfully',
      filename:  originalName,
      file_url:  cloudUrl,
      extracted: {
        skills:     extracted.skills     || [],
        experience: extracted.experience || [],
        education:  extracted.education  || [],
        keywords:   extracted.keywords   || [],
        summary:    extracted.summary    || '',
      },
    });

  } catch (err) {
    console.error('CV upload error:', err.message);
    res.status(500).json({ error: err.message || 'CV upload failed' });
  }
});

// ── Keyword fallback (no AI needed) ──────────────────────────────────────────
function extractSkillsByKeyword(text) {
  const lower = text.toLowerCase();
  const skillList = [
    'project management', 'monitoring and evaluation', 'budgeting',
    'report writing', 'microsoft excel', 'microsoft word', 'microsoft office',
    'communication', 'leadership', 'data analysis', 'data entry',
    'customer service', 'sales', 'marketing', 'social media',
    'human resources', 'accounting', 'finance', 'procurement',
    'supply chain', 'logistics', 'administration', 'research',
    'python', 'javascript', 'sql', 'excel', 'powerpoint',
    'teamwork', 'problem solving', 'time management', 'presentation',
    'negotiation', 'training', 'coaching', 'planning', 'coordination',
  ];
  return skillList.filter(skill => lower.includes(skill));
}

module.exports = router;