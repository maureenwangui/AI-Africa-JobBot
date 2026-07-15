// services/cronJobs.js
const cron = require('node-cron');
const prisma = require('../confiq/prisma');
const matchingService = require('./matchingService');
const notificationService = require('./notificationService');
const emailService = require('./emailService');

// Users eligible for matching/summaries: on the free plan, or on a paid plan
// with an active subscription.
const ELIGIBLE_USER_FILTER = {
  OR: [
    { plan: 'FREE' },
    { subscriptionStatus: 'ACTIVE' },
  ],
};

// ══════════════════════════════════════════════════════════════════════════════
//  JOB MATCHING — every 6 hours
// ══════════════════════════════════════════════════════════════════════════════
cron.schedule('0 */6 * * *', async () => {
  console.log('🤖 Running job matching cycle...');

  try {
    // Only consider users who have uploaded at least one CV/resume.
    const rawUsers = await prisma.user.findMany({
      where: {
        ...ELIGIBLE_USER_FILTER,
        resumes: { some: {} },
      },
      select: {
        id: true, email: true, phone: true, name: true, plan: true,
        profile: {
          select: {
            skills: true, summary: true, experience: true,
            preferredRoles: true, preferredLocations: true, remotePreference: true,
          },
        },
      },
    });

    // Flatten: { ...user, ...user.profile } so matchingService gets one flat object
    const activeUsers = rawUsers
      .filter(u => u.profile)
      .map(({ profile, ...user }) => ({ ...user, ...profile }));

    const jobs = await prisma.job.findMany({
      where:   { status: 'ACTIVE' },
      include: { company: true },
      orderBy: { createdAt: 'desc' },
      take:    500,
    });

    for (const user of activeUsers) {
      try {
        const matches    = await matchingService.matchJobsToProfile(user, jobs);
        const topMatches = matches.filter(j => j.match_score >= 60).slice(0, 5);

        if (topMatches.length === 0) continue;

        if (user.plan === 'BUSINESS') {
          const month = new Date().toISOString().slice(0, 7);

          const usageRecord = await prisma.usage.findFirst({
            where:  { userId: user.id, month },
            select: { applicationsUsed: true },
          });
          const used = usageRecord?.applicationsUsed || 0;

          if (used < 200) {
            for (const job of topMatches.slice(0, 3)) {
              const already = await prisma.application.findFirst({
                where:  { userId: user.id, jobId: job.id },
                select: { id: true },
              });
              if (already) continue;

              await prisma.application.create({
                data: {
                  userId:               user.id,
                  jobId:                job.id,
                  matchScore:           job.match_score,
                  status:               'APPLIED',
                  appliedAutomatically: true,
                  appliedAt:            new Date(),
                },
              });

              // Atomic upsert with increment — race-condition safe.
              await prisma.usage.upsert({
                where:  { userId_month: { userId: user.id, month } },
                update: { applicationsUsed: { increment: 1 } },
                create: {
                  userId:                user.id,
                  month,
                  applicationsUsed:      1,
                  resumesOptimized:      0,
                  coverLettersGenerated: 0,
                },
              });

              notificationService
                .sendApplicationAlert(user, { title: job.title, company: job.company?.name || 'the company' })
                .catch(console.error);
            }
          }
        } else {
          // Notify non-Business users of matches instead of auto-applying
          notificationService.sendMatchAlert(user, topMatches.length).catch(console.error);
        }
      } catch (err) {
        console.error(`Matching error for user ${user.id}:`, err.message);
      }
    }

    console.log(`✅ Job matching done for ${activeUsers.length} users`);
  } catch (err) {
    console.error('Job matching cycle failed:', err.message);
  }
});

// ══════════════════════════════════════════════════════════════════════════════
//  DAILY SUMMARY EMAILS — every day at 8am Nairobi time (UTC+3 = 5am UTC)
// ══════════════════════════════════════════════════════════════════════════════
cron.schedule('0 5 * * *', async () => {
  console.log('📧 Sending daily summaries...');

  try {
    const users = await prisma.user.findMany({
      where: ELIGIBLE_USER_FILTER,
      select: {
        id: true, email: true, name: true, phone: true, plan: true,
      },
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const user of users) {
      try {
        const [totalApplications, newMatches] = await Promise.all([
          prisma.application.count({
            where: { userId: user.id },
          }),
          prisma.application.count({
            where: { userId: user.id, createdAt: { gte: today } },
          }),
        ]);

        await emailService.sendDailySummary(user, {
          total_applications: totalApplications,
          new_matches:        newMatches,
        });
      } catch (err) {
        console.error(err);
      }
    }

    console.log('✅ Daily summaries sent');
  } catch (err) {
    console.error('Daily summary cycle failed:', err.message);
  }
});

console.log('⏰ Cron jobs started: job matching (every 6h) + daily summaries (8am EAT)');