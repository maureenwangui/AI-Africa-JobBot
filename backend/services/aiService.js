// services/aiService.js — Anthropic AI Integration
const axios = require('axios');
const fs = require('fs');

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';

async function callClaude(prompt, systemPrompt = '') {
  const res = await axios.post(ANTHROPIC_API, {
    model: 'claude-sonnet-4-6',
    max_tokens: 1500,
    system: systemPrompt,
    messages: [{ role: 'user', content: prompt }],
  }, {
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
  });
  return res.data.content[0].text;
}

// Extract structured data from CV text
async function extractCvData(filePath) {
  let cvText = '';
  try {
    // For MVP: read text if txt/docx converted, or use filename as fallback
    if (fs.existsSync(filePath)) {
      const ext = filePath.toLowerCase();
      if (ext.endsWith('.txt')) {
        cvText = fs.readFileSync(filePath, 'utf8');
      } else {
        // Placeholder — in production, use pdf-parse or mammoth for PDF/DOCX
        cvText = `CV file: ${filePath}`;
      }
    }
  } catch {}

  const prompt = `
Extract structured data from this CV. Return ONLY valid JSON, no markdown.

CV Content:
${cvText || 'No text extracted, use generic professional profile'}

Return this exact JSON structure:
{
  "name": "Full Name",
  "email": "email if found",
  "phone": "phone if found",
  "summary": "2-3 sentence professional summary",
  "skills": ["skill1", "skill2", "skill3"],
  "experience": [{"title": "Job Title", "company": "Company", "duration": "2020-2023", "description": "Brief description"}],
  "education": [{"degree": "Degree Name", "institution": "School", "year": "2015"}],
  "keywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"]
}`;

  try {
    const response = await callClaude(prompt, 'You are a CV parser. Return only valid JSON.');
    const clean = response.replace(/```json|```/g, '').trim();
    return JSON.parse(clean);
  } catch (err) {
    console.error('CV extraction error:', err.message);
    return { skills: [], experience: [], education: [], keywords: [], summary: '' };
  }
}

// Generate tailored cover letter
async function generateCoverLetter(profile, job) {
  const skills = (() => { try { return JSON.parse(profile.skills || '[]').join(', '); } catch { return ''; } })();
  const exp = (() => { try { return JSON.parse(profile.experience || '[]').map(e => e.title).join(', '); } catch { return ''; } })();

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
- Location: ${job.location}
- Description: ${job.description?.slice(0, 500) || ''}

Write a 3-paragraph cover letter (150-200 words). Be specific, professional, and enthusiastic. Do not use placeholders.`;

  return callClaude(prompt, 'You are an expert career coach writing cover letters for African job seekers.');
}

// Match score between profile and job
async function calculateMatchScore(profile, job) {
  const skills = (() => { try { return JSON.parse(profile.skills || '[]').join(', '); } catch { return ''; } })();
  const keywords = (() => { try { return JSON.parse(profile.keywords || '[]').join(', '); } catch { return ''; } })();

  const prompt = `
Rate the match between this candidate and job on a scale of 0-100.
Return ONLY a JSON object: {"score": 85, "reason": "brief reason"}

Candidate skills: ${skills}
Candidate keywords: ${keywords}

Job title: ${job.title}
Job requirements: ${job.requirements?.slice(0, 300) || job.description?.slice(0, 300) || ''}`;

  try {
    const res = await callClaude(prompt, 'You are a job matching AI. Return only valid JSON.');
    const clean = res.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    return Math.min(100, Math.max(0, parsed.score || 50));
  } catch {
    return 50;
  }
}

module.exports = { extractCvData, generateCoverLetter, calculateMatchScore };