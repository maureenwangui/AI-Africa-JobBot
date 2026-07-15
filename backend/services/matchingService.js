// services/matchingService.js

// Fast keyword-based matching (no API cost)
function keywordMatch(profile, job) {
  let score = 0;
  const profileText = [
    profile.skills || '', profile.summary || '',
    profile.experience || '', profile.preferredRoles || '',
  ].join(' ').toLowerCase();

  const jobText = [job.title, job.description, job.requirements].filter(Boolean).join(' ').toLowerCase();

  // Title match
  const titleWords = job.title.toLowerCase().split(/\s+/);
  titleWords.forEach(w => { if (w.length > 3 && profileText.includes(w)) score += 10; });

  // Skills overlap — Profile.skills is stored as a JSON-encoded array string
  try {
    const skills = JSON.parse(profile.skills || '[]');
    skills.forEach(s => { if (jobText.includes(String(s).toLowerCase())) score += 6; });
  } catch {}

  // Location preference — Profile.preferredLocations is a comma-separated string
  if (profile.preferredLocations && job.location) {
    const firstPreference = profile.preferredLocations.toLowerCase().split(',')[0].trim();
    if (firstPreference && job.location.toLowerCase().includes(firstPreference)) score += 15;
  }

  // Remote preference — Job.remoteType is an enum (REMOTE | HYBRID | ONSITE)
  if (profile.remotePreference && job.remoteType === 'REMOTE') score += 10;

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