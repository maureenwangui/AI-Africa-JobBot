// services/aiService.js — Anthropic AI Integration
// Fixed: extractCvData now accepts text string directly (not file path)
//        profile.js handles file reading + text extraction before calling this
const axios = require('axios');

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';

async function callClaude(prompt, systemPrompt = '') {
  const res = await axios.post(ANTHROPIC_API, {
    model:      'claude-sonnet-4-6',
    max_tokens: 1500,
    system:     systemPrompt,
    messages:   [{ role: 'user', content: prompt }],
  }, {
    headers: {
      'x-api-key':         process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Type':      'application/json',
    },
    timeout: 30000, // 30 second timeout
  });
  return res.data.content[0].text;
}

// ── extractCvData ─────────────────────────────────────────────────────────────
// Fixed: now accepts cvText (string) directly instead of a file path
// profile.js extracts text from PDF/DOCX first, then calls this with the text
async function extractCvData(cvText) {
  // Truncate to 3000 chars to keep prompt cost low
  const truncated = (cvText || '').slice(0, 3000);

  const prompt = `
Extract structured data from this CV. Return ONLY valid JSON, no markdown, no explanation.

CV Content:
${truncated || 'No text provided — generate a generic professional profile'}

Return this exact JSON structure:
{
  "name": "Full Name or empty string",
  "email": "email if found or empty string",
  "phone": "phone if found or empty string",
  "summary": "2-3 sentence professional summary based on CV content",
  "skills": ["skill1", "skill2", "skill3", "skill4", "skill5"],
  "experience": [{"title": "Job Title", "company": "Company Name", "duration": "2020-2023", "description": "Brief description"}],
  "education": [{"degree": "Degree Name", "institution": "School Name", "year": "2015"}],
  "keywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"]
}`;

  try {
    const response = await callClaude(prompt, 'You are a CV parser. Extract information from the CV text and return only valid JSON. Never return markdown code blocks.');
    const clean    = response.replace(/```json|```/g, '').trim();
    const parsed   = JSON.parse(clean);

    // Ensure all expected fields are present
    return {
      name:       parsed.name       || '',
      email:      parsed.email      || '',
      phone:      parsed.phone      || '',
      summary:    parsed.summary    || '',
      skills:     Array.isArray(parsed.skills)     ? parsed.skills     : [],
      experience: Array.isArray(parsed.experience) ? parsed.experience : [],
      education:  Array.isArray(parsed.education)  ? parsed.education  : [],
      keywords:   Array.isArray(parsed.keywords)   ? parsed.keywords   : [],
    };
  } catch (err) {
    console.error('CV extraction error:', err.message);
    return {
      name: '', email: '', phone: '', summary: '',
      skills: [], experience: [], education: [], keywords: [],
    };
  }
}

// ── generateCoverLetter ───────────────────────────────────────────────────────
async function generateCoverLetter(profile, job) {
  const skills = (() => {
    try { return JSON.parse(profile.skills || '[]').join(', '); } catch { return profile.skills || ''; }
  })();
  const exp = (() => {
    try { return JSON.parse(profile.experience || '[]').map(e => e.title).join(', '); } catch { return ''; }
  })();

  const prompt = `
Write a professional, concise cover letter for this job application.

Candidate:
- Name: ${profile.name || 'Applicant'}
- Skills: ${skills}
- Experience: ${exp}
- Summary: ${profile.summary || ''}

Job:
- Title: ${job.title}
- Company: ${job.company}
- Location: ${job.location || 'Kenya'}
- Description: ${(job.description || '').slice(0, 500)}

Write a 3-paragraph cover letter (150-200 words). Be specific, professional, and enthusiastic. Do not use placeholders like [Your Name].`;

  return callClaude(prompt, 'You are an expert career coach writing cover letters for African job seekers.');
}

// ── calculateMatchScore ───────────────────────────────────────────────────────
async function calculateMatchScore(profile, job) {
  const skills = (() => {
    try { return JSON.parse(profile.skills || '[]').join(', '); } catch { return profile.skills || ''; }
  })();
  const keywords = (() => {
    try { return JSON.parse(profile.keywords || '[]').join(', '); } catch { return ''; }
  })();

  const prompt = `
Rate the match between this candidate and job on a scale of 0-100.
Return ONLY a JSON object with no markdown: {"score": 85, "reason": "brief reason"}

Candidate skills: ${skills}
Candidate keywords: ${keywords}

Job title: ${job.title}
Job requirements: ${(job.requirements || job.description || '').slice(0, 300)}`;

  try {
    const res    = await callClaude(prompt, 'You are a job matching AI. Return only valid JSON.');
    const clean  = res.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    return Math.min(100, Math.max(0, parsed.score || 50));
  } catch {
    return 50;
  }
}

module.exports = { extractCvData, generateCoverLetter, calculateMatchScore };