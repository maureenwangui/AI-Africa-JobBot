// services/matchingService.js
const aiService = require('./aiService');

// Fast keyword-based matching (no API cost)
function keywordMatch(profile, job) {
  let score = 0;
  const profileText = [
    profile.skills || '', profile.keywords || '', profile.summary || '',
    profile.experience || '', profile.preferred_roles || '',
  ].join(' ').toLowerCase();

  const jobText = [job.title, job.description, job.requirements].filter(Boolean).join(' ').toLowerCase();

  // Title match
  const titleWords = job.title.toLowerCase().split(/\s+/);
  titleWords.forEach(w => { if (w.length > 3 && profileText.includes(w)) score += 10; });

  // Keyword overlap
  try {
    const keywords = JSON.parse(profile.keywords || '[]');
    keywords.forEach(kw => { if (jobText.includes(kw.toLowerCase())) score += 8; });
  } catch {}

  // Skills overlap
  try {
    const skills = JSON.parse(profile.skills || '[]');
    skills.forEach(s => { if (jobText.includes(s.toLowerCase())) score += 6; });
  } catch {}

  // Location preference
  if (profile.preferred_location && job.location) {
    if (job.location.toLowerCase().includes(profile.preferred_location.toLowerCase().split(',')[0])) score += 15;
  }
  if (profile.remote_preference && job.remote) score += 10;

  return Math.min(100, score);
}

async function matchJobsToProfile(profile, jobs) {
  const results = jobs.map(job => {
    const score = keywordMatch(profile, job);
    return { ...job, match_score: score };
  });

  // Return top matches sorted by score
  return results
    .filter(j => j.match_score > 20)
    .sort((a, b) => b.match_score - a.match_score)
    .slice(0, 50);
}

module.exports = { matchJobsToProfile, keywordMatch };