// routes/profile.js — Prisma + Local Upload + PDF/DOCX text extraction
const express    = require('express');
const multer     = require('multer');
const path       = require('path');
const fs         = require('fs');
const prisma     = require('../confiq/prisma');
const { auth }   = require('../middleware/auth');
const aiService  = require('../services/aiService');
const cvParser = require('../services/cvParser');
const router = express.Router();
const { extractCountry } = require("../services/jobCollector/countryExtractor");
const { generateRecommendations } = require("../services/recommendationService");


// ── Multer + storage ───────────────────────────────────────────────
const uploadDir = path.join(__dirname, "../uploads");

if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination(req, file, cb) {
        cb(null, uploadDir);
    },

    filename(req, file, cb) {
        const ext = path.extname(file.originalname);
        cb(null, `cv_${req.user.id}_${Date.now()}${ext}`);
    }
});
    
const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
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
      country:            profile.country,
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
      country,
    } = req.body;

    // Profile has no dedicated `keywords` column — merge any submitted
    // keywords into `skills` (deduplicated) instead of writing an invalid field.
    const mergedSkills = (() => {
      if (!skills && !keywords) return undefined;
      const combined = [...(Array.isArray(skills) ? skills : []), ...(Array.isArray(keywords) ? keywords : [])];
      return JSON.stringify([...new Set(combined)]);
    })();

    const data = {
      country:            country ?? undefined,
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
  
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    
    const fileUrl = `/uploads/${req.file.filename}`;
    const filePath = req.file.path;
    const originalName  = req.file.originalname;
    const fileSize      = req.file.size;
    const fileType      = req.file.mimetype;

    if (!fs.existsSync(filePath)) {
      throw new Error("Uploaded file missing");
   }
   
    // ── Text extraction ───────────────────────────────────────────────────────
    let extractedText = '';

    try {
      extractedText = await extractTextFromFile(filePath, originalName);

      console.log("========== CV TEXT ==========");
      console.log("Length:", extractedText.length);
      console.log(extractedText.substring(0, 500));
      console.log("=============================");

    } catch (e) {
      console.error('Text extraction failed (non-fatal):', e.message);
    }
    
    // ── AI skill extraction ───────────────────────────────────────────────────
    // ── AI + Offline CV Extraction ─────────────────────────────────────────────
let extracted = {
  skills: [],
  experience: [],
  education: [],
  keywords: [],
  summary: ""
};

if (extractedText && extractedText.trim().length > 50) {

  try {

    console.log("Trying AI parser...");

    extracted = await aiService.extractCvData(extractedText);

    // If AI returned little or nothing, use offline parser
    if (
      !extracted.skills?.length &&
      !extracted.experience?.length &&
      !extracted.education?.length
    ) {

      console.log("⚠️ AI returned empty data. Switching to offline parser...");

      extracted = cvParser.parseCV(extractedText);

    } else {

      console.log("✅ AI parser succeeded.");

    }

  } catch (err) {

    console.log("⚠️ AI unavailable. Using offline parser...");

    extracted = cvParser.parseCV(extractedText);

  }

} else {

  console.log("⚠️ No text extracted.");

}

    // 👇 ADD IT HERE
    console.log("Skills to save:", extracted.skills);
    console.log("Experience to save:", extracted.experience);
    console.log("Education to save:", extracted.education);
    
    const country = extractCountry({
      location: extracted.summary,
      description: extractedText,
   });
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
          country:    country || null,
        },
        create: {
          userId:     String(req.user.id),
          country:    country || null,
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
          fileUrl:            fileUrl,
          fileSize:           fileSize,
          fileType:           fileType,
          extractedText:      extractedText || null,
          parsedSuccessfully: extractedText.trim().length > 50,
        },
      }),
    ]);
       
       // Automatically generate recommendations
        await generateRecommendations(req.user.id);
    res.json({
      message:   'CV uploaded and parsed successfully',
      filename:  originalName,
      file_url:  fileUrl,
      extracted: {
        country:    country || null,
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