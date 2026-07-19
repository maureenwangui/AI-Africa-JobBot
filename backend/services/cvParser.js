'use strict';

/**
 * ============================================================================
 * Africa JobBot CV Parser
 * Part 1A — Utilities & Normalization
 * ============================================================================
 */

/**
 * Normalize all whitespace
 */
function normalizeText(text = '') {
  if (typeof text !== 'string') return '';

  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\t/g, ' ')
    .replace(/\u00A0/g, ' ')
    .replace(/[ ]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Split text into clean lines
 */
function getLines(text = '') {
  return normalizeText(text)
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
}

/**
 * Remove duplicate values
 */
function unique(array = []) {
  return [...new Set(array)];
}

/**
 * Remove duplicate values (case insensitive)
 */
function uniqueIgnoreCase(array = []) {

  const seen = new Set();

  return array.filter(item => {

    const key = item.toLowerCase().trim();

    if (seen.has(key)) return false;

    seen.add(key);

    return true;

  });

}

/**
 * Clean strings
 */
function clean(value = '') {

  return value
    .replace(/\s+/g, ' ')
    .replace(/\u2022/g, '')
    .replace(/\*/g, '')
    .trim();

}

/**
 * Safe regex search
 */
function match(text, regex) {

  const result = text.match(regex);

  return result ? result[0] : '';

}

/**
 * Remove empty values
 */
function compact(arr = []) {

  return arr.filter(Boolean);

}

/**
 * Check if string contains numbers
 */
function hasNumber(text = '') {

  return /\d/.test(text);

}

/**
 * Check if string looks like a heading
 */
function looksLikeHeading(line = '') {

  if (!line) return false;

  if (line.length > 60) return false;

  if (line === line.toUpperCase()) return true;

  return /^[A-Z][A-Za-z ]+$/.test(line);

}

/**
 * Convert text to Title Case
 */
function titleCase(str = '') {

  return str
    .toLowerCase()
    .replace(/\b\w/g, c => c.toUpperCase());

}

/**
 * Find all regex matches
 */
function findAll(text, regex) {

  return [...text.matchAll(regex)].map(m => m[0]);

}

/**
 * Count years from date strings
 */
function calculateYears(startYear, endYear) {

  if (!startYear) return 0;

  const start = Number(startYear);

  const end = endYear
      ? Number(endYear)
      : new Date().getFullYear();

  if (isNaN(start) || isNaN(end)) return 0;

  return Math.max(0, end - start);

}

/**
 * Detect whether CV text is usable
 */
function isValidCv(text = '') {

  return normalizeText(text).length > 150;

}

/**
 * Extract years appearing in CV
 */
function extractYears(text = '') {

  const years = findAll(
      text,
      /\b(19\d{2}|20\d{2})\b/g
  );

  return unique(years);

}

// ─────────────────────────────────────────────
// SKILLS EXTRACTION
// ─────────────────────────────────────────────

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractSkills(text) {
  if (!text) return [];

  const lower = text.toLowerCase();
  const found = [];

  for (const skill of SKILL_SET) {
    const escaped = escapeRegex(skill);

    // Match complete words or phrases
    const regex = new RegExp(`\\b${escaped}\\b`, 'i');

    if (regex.test(lower)) {
      found.push(skill);
    }
  }

  // Remove duplicates
  return [...new Set(found)]
    .sort((a, b) => a.localeCompare(b));
}


// ─────────────────────────────────────────────
// KEYWORDS EXTRACTION
// ─────────────────────────────────────────────

function extractKeywords(text) {
  const keywords = [];

  keywords.push(...extractSkills(text));

  // Add certifications
  for (const pattern of CERT_PATTERNS) {
    const matches = text.match(pattern);
    if (matches) keywords.push(...matches);
  }

  // Add languages
  const lower = text.toLowerCase();

  for (const language of LANGUAGES) {
    if (lower.includes(language.toLowerCase())) {
      keywords.push(language);
    }
  }

  return [...new Set(keywords)];
}

// ─────────────────────────────────────────────
// EXPERIENCE EXTRACTION
// ─────────────────────────────────────────────

function extractExperience(text) {
  if (!text) return [];

  const lines = getLines(text);
  const experience = [];

  let currentSection = false;
  let currentJob = null;

  const dateRegex =
    /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec|January|February|March|April|June|July|August|September|October|November|December)?\s*\d{4}\s*(-|–|to)\s*(Present|Current|Now|\d{4})/i;

  for (const line of lines) {

    const lower = line.toLowerCase();

    // Detect Experience section
    if (SECTION_HEADERS.experience.includes(lower.replace(':', ''))) {
      currentSection = true;
      continue;
    }

    // Stop when another section begins
    if (currentSection && isSectionHeader(line)) {
      break;
    }

    if (!currentSection) continue;

    // Date line
    if (dateRegex.test(line)) {

      if (currentJob) {
        experience.push(currentJob);
      }

      currentJob = {
        title: "",
        company: "",
        duration: line.trim(),
        description: ""
      };

      continue;
    }

    if (!currentJob) continue;

    // First non-date line becomes title
    if (!currentJob.title) {
      currentJob.title = line.trim();
      continue;
    }

    // Second becomes company
    if (!currentJob.company) {
      currentJob.company = line.trim();
      continue;
    }

    // Remaining lines become description
    currentJob.description += line + " ";
  }

  if (currentJob) {
    experience.push(currentJob);
  }

  return experience.map(job => ({
    title: job.title.trim(),
    company: job.company.trim(),
    duration: job.duration.trim(),
    description: job.description.trim()
  }));
}

// ─────────────────────────────────────────────
// EDUCATION EXTRACTION
// ─────────────────────────────────────────────

function extractEducation(text) {
  if (!text) return [];

  const lines = getLines(text);
  const education = [];

  let currentSection = false;
  let currentEducation = null;

  const yearRegex = /\b(19|20)\d{2}\b/;

  const degreeKeywords = [
    "bachelor",
    "master",
    "phd",
    "doctor",
    "diploma",
    "certificate",
    "degree",
    "bsc",
    "msc",
    "ba",
    "ma",
    "bcom",
    "bed",
    "llb",
    "mba",
    "associate",
    "higher diploma"
  ];

  for (const line of lines) {

    const lower = line.toLowerCase();

    // Start Education section
    if (SECTION_HEADERS.education.includes(lower.replace(':', ''))) {
      currentSection = true;
      continue;
    }

    // Stop when another section starts
    if (currentSection && isSectionHeader(line)) {
      break;
    }

    if (!currentSection) continue;

    // Degree line
    if (degreeKeywords.some(k => lower.includes(k))) {

      if (currentEducation) {
        education.push(currentEducation);
      }

      currentEducation = {
        degree: line.trim(),
        institution: "",
        year: ""
      };

      continue;
    }

    if (!currentEducation) continue;

    // Institution
    if (
      !currentEducation.institution &&
      (
        lower.includes("university") ||
        lower.includes("college") ||
        lower.includes("school") ||
        lower.includes("institute") ||
        lower.includes("polytechnic") ||
        lower.includes("academy")
      )
    ) {
      currentEducation.institution = line.trim();
      continue;
    }

    // Graduation year
    if (!currentEducation.year) {
      const match = line.match(yearRegex);
      if (match) {
        currentEducation.year = match[0];
      }
    }
  }

  if (currentEducation) {
    education.push(currentEducation);
  }

  return education;
}

// ─────────────────────────────────────────────
// CERTIFICATIONS EXTRACTION
// ─────────────────────────────────────────────

function extractCertifications(text) {
  if (!text) return [];

  const certifications = [];

  for (const pattern of CERT_PATTERNS) {
    const matches = text.match(pattern);

    if (matches) {
      certifications.push(...matches);
    }
  }

  return [...new Set(certifications)].sort();
}


// ─────────────────────────────────────────────
// LANGUAGES EXTRACTION
// ─────────────────────────────────────────────

function extractLanguages(text) {
  if (!text) return [];

  const lower = text.toLowerCase();
  const found = [];

  for (const language of LANGUAGES) {
    if (lower.includes(language.toLowerCase())) {
      found.push(language);
    }
  }

  return [...new Set(found)].sort();
}


// ─────────────────────────────────────────────
// PROFESSIONAL SUMMARY
// ─────────────────────────────────────────────

function generateSummary(parsed) {

  const parts = [];

  if (parsed.experience.length) {
    parts.push(
      `${parsed.experience.length} professional role${parsed.experience.length > 1 ? "s" : ""}`
    );
  }

  if (parsed.education.length) {
    parts.push(
      parsed.education[0].degree
    );
  }

  if (parsed.skills.length) {
    parts.push(
      `${parsed.skills.slice(0, 8).join(", ")}`
    );
  }

  if (parsed.certifications.length) {
    parts.push(
      `${parsed.certifications.length} certification${parsed.certifications.length > 1 ? "s" : ""}`
    );
  }

  if (!parts.length) {
    return "";
  }

  return `Professional with ${parts.join(". ")}.`;
}

// ─────────────────────────────────────────────
// YEARS OF EXPERIENCE
// ─────────────────────────────────────────────

function calculateExperienceYears(experience) {

  if (!experience.length) return 0;

  let earliest = null;

  for (const job of experience) {

    const match = job.duration.match(/\b(19|20)\d{2}\b/);

    if (match) {

      const year = Number(match[0]);

      if (!earliest || year < earliest) {
        earliest = year;
      }

    }

  }

  if (!earliest) return 0;

  return new Date().getFullYear() - earliest;

}


// ─────────────────────────────────────────────
// PROFILE SCORE
// ─────────────────────────────────────────────

function calculateProfileScore(profile) {

  let score = 0;

  if (profile.name) score += 10;

  if (profile.email) score += 10;

  if (profile.phone) score += 10;

  if (profile.skills.length >= 5) score += 20;

  if (profile.experience.length) score += 20;

  if (profile.education.length) score += 15;

  if (profile.summary) score += 10;

  if (profile.linkedin) score += 5;

  return Math.min(score, 100);

}


// ─────────────────────────────────────────────
// MAIN PARSER
// ─────────────────────────────────────────────

function parseCV(cvText) {

  cvText = normalizeText(cvText);

  const lines = getLines(cvText);

  const parsed = {

    name: extractName(lines),

    email: extractEmail(cvText),

    phone: extractPhone(cvText),

    location: extractLocation(cvText),

    linkedin: extractLinkedIn(cvText),

    github: extractGitHub(cvText),

    portfolio: extractPortfolio(cvText),

    skills: extractSkills(cvText),

    keywords: extractKeywords(cvText),

    experience: extractExperience(cvText),

    education: extractEducation(cvText),

    certifications: extractCertifications(cvText),

    languages: extractLanguages(cvText)

  };

  parsed.summary = generateSummary(parsed);

  parsed.yearsExperience = calculateExperienceYears(parsed.experience);

  parsed.profileScore = calculateProfileScore(parsed);

  return parsed;

}


// ─────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────

module.exports = {

  parseCV,

  extractSkills,

  extractKeywords,

  extractExperience,

  extractEducation,

  extractCertifications,

  extractLanguages,

  calculateProfileScore,

  calculateExperienceYears,

  generateSummary,
  detectPreferredRole,
  calculateATSScore,
  findMissingSections,
  getResumeRating

};

function calculateExperienceYears(experience = []) {

    let totalYears = 0;

    for (const job of experience) {

        if (!job.duration) continue;

        const years = job.duration.match(/\d{4}/g);

        if (!years) continue;

        if (years.length >= 2) {

            const start = parseInt(years[0]);
            const end = years[1].toLowerCase() === "present"
                ? new Date().getFullYear()
                : parseInt(years[1]);

            if (!isNaN(start) && !isNaN(end) && end >= start) {
                totalYears += end - start;
            }

        } else if (years.length === 1) {

            const start = parseInt(years[0]);

            if (!isNaN(start)) {
                totalYears += new Date().getFullYear() - start;
            }

        }

    }

    return Math.max(0, totalYears);

}

function generateSummary(profile = {}) {

    const years =
        calculateExperienceYears(profile.experience || []);

    const latestRole =
        profile.experience?.[0]?.title ||
        "professional";

    const degree =
        profile.education?.[0]?.degree || "";

    const skills =
        (profile.skills || [])
        .slice(0, 6)
        .join(", ");

    let summary = "";

    if (years > 0) {

        summary +=
            `Experienced ${latestRole} with over ${years} years of professional experience.`;

    } else {

        summary +=
            `Motivated ${latestRole} with practical industry knowledge.`;

    }

    if (degree) {

        summary += ` Holds ${degree}.`;

    }

    if (skills.length) {

        summary += ` Skilled in ${skills}.`;

    }

    summary +=
        " Committed to delivering high-quality results while working effectively both independently and within teams.";

    return summary.trim();

}

function detectPreferredRole(profile = {}) {

    if (profile.experience && profile.experience.length) {

        return profile.experience[0].title;

    }

    if (profile.education && profile.education.length) {

        const degree =
            profile.education[0].degree.toLowerCase();

        if (degree.includes("computer"))
            return "Software Developer";

        if (degree.includes("information"))
            return "IT Specialist";

        if (degree.includes("business"))
            return "Business Analyst";

        if (degree.includes("account"))
            return "Accountant";

        if (degree.includes("marketing"))
            return "Marketing Officer";

        if (degree.includes("human resource"))
            return "HR Officer";

        if (degree.includes("engineering"))
            return "Engineer";

    }

    return "";

}

function calculateATSScore(profile = {}) {

    let score = 0;

    if (profile.name) score += 10;

    if (profile.email) score += 10;

    if (profile.phone) score += 10;

    if (profile.location) score += 5;

    if (profile.summary && profile.summary.length > 50)
        score += 15;

    if ((profile.skills || []).length >= 5)
        score += 15;

    if ((profile.experience || []).length)
        score += 15;

    if ((profile.education || []).length)
        score += 10;

    if ((profile.certifications || []).length)
        score += 5;

    if ((profile.languages || []).length)
        score += 5;

    return Math.min(score, 100);

}

function findMissingSections(profile = {}) {

    const missing = [];

    if (!profile.email)
        missing.push("Email address");

    if (!profile.phone)
        missing.push("Phone number");

    if (!profile.location)
        missing.push("Location");

    if (!profile.summary)
        missing.push("Professional summary");

    if (!(profile.skills || []).length)
        missing.push("Skills");

    if (!(profile.experience || []).length)
        missing.push("Work experience");

    if (!(profile.education || []).length)
        missing.push("Education");

    if (!(profile.languages || []).length)
        missing.push("Languages");

    if (!(profile.certifications || []).length)
        missing.push("Certifications");

    return missing;

}

function getResumeRating(score) {

    if (score >= 90)
        return "Excellent";

    if (score >= 75)
        return "Very Good";

    if (score >= 60)
        return "Good";

    if (score >= 40)
        return "Fair";

    return "Needs Improvement";

}