// services/matchingService.js

// Fast keyword-based matching (no API cost)
function keywordMatch(profile, job) {
  let score = 0;

  const profileText = [
    profile.skills || "",
    profile.summary || "",
    profile.experience || "",
    profile.preferredRoles || "",
  ].join(" ").toLowerCase();

  const jobText = [
    job.title,
    job.description,
    job.requirements,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  // Title match
  const titleWords = job.title.toLowerCase().split(/\s+/);

  titleWords.forEach((w) => {
    if (w.length > 3 && profileText.includes(w)) score += 10;
  });

  // Skills overlap
  try {
    const skills = JSON.parse(profile.skills || "[]");

    skills.forEach((s) => {
      if (jobText.includes(String(s).toLowerCase())) score += 6;
    });
  } catch {}

  // Preferred location
  if (profile.preferredLocations && job.location) {
    const preferred = profile.preferredLocations
      .toLowerCase()
      .split(",")[0]
      .trim();

    if (preferred && job.location.toLowerCase().includes(preferred)) {
      score += 15;
    }
  }

  // Remote preference
  if (profile.remotePreference && job.remoteType === "REMOTE") {
    score += 10;
  }

  return Math.min(100, score);
}

async function matchJobsToProfile(profile, jobs) {

  const userCountry = (profile.country || "").toUpperCase();

  const eligibleJobs = jobs.filter((job) => {

    // Global jobs
    if (job.region === "GLOBAL") return true;

    // Africa jobs
    if (
      job.region === "AFRICA" &&
      [
        "KENYA",
        "UGANDA",
        "TANZANIA",
        "RWANDA",
        "BURUNDI",
        "SOUTH_SUDAN",
        "ETHIOPIA",
        "NIGERIA",
        "GHANA",
        "SOUTH_AFRICA",
        "EGYPT",
        "MOROCCO",
      ].includes(userCountry)
    ) {
      return true;
    }

    // East Africa jobs
    if (
      job.region === "EAST_AFRICA" &&
      [
        "KENYA",
        "UGANDA",
        "TANZANIA",
        "RWANDA",
        "BURUNDI",
        "SOUTH_SUDAN",
      ].includes(userCountry)
    ) {
      return true;
    }

    // Exact country match
    if (
      job.country &&
      job.country.toUpperCase() === userCountry
    ) {
      return true;
    }

    return false;
  });

  const results = eligibleJobs.map((job) => ({
    ...job,
    match_score: keywordMatch(profile, job),
  }));

  return results
    .filter((j) => j.match_score > 20)
    .sort((a, b) => b.match_score - a.match_score)
    .slice(0, 50);
}

module.exports = {
  matchJobsToProfile,
  keywordMatch,
};