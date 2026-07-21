const prisma = require("../confiq/prisma");
const { matchJobsToProfile } = require("./matchingService");

async function generateRecommendations(userId) {

  // Load profile
  const profile = await prisma.profile.findUnique({
    where: {
      userId: String(userId),
    },
  });

  if (!profile) {
    console.log("No profile found");
    return [];
  }

  // Load active jobs
  const jobs = await prisma.job.findMany({
    where: {
      status: "ACTIVE",
    },
  });

  if (!jobs.length) {
    console.log("No active jobs");
    return [];
  }

  // Match jobs
  const matches = await matchJobsToProfile(profile, jobs);

  // Delete old recommendations
  await prisma.jobRecommendation.deleteMany({
    where: {
      userId: String(userId),
    },
  });

  // Save recommendations
  // Save recommendations
await prisma.jobRecommendation.createMany({
  data: matches.map(job => ({
    userId: String(userId),
    jobId: job.id,
    recommendationScore: job.match_score,
    aiExplanation: "Matched based on skills, location, and experience.",
  })),
});

  console.log(`Saved ${matches.length} recommendations.`);

  return matches;
}

module.exports = {
  generateRecommendations,
};