// services/cronJobs.js
const cron = require('node-cron');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const matchingService = require('./matchingService');
const notificationService = require('./notificationService');
const emailService = require('./emailService');

// ══════════════════════════════════════════════════════════════════════════════
//  JOB MATCHING — every 6 hours
// ══════════════════════════════════════════════════════════════════════════════
cron.schedule('0 */6 * * *', async () => {
  console.log('🤖 Running job matching cycle...');

  // Replaces the JOIN query — flatten profile fields onto each user object
  // so matchingService.matchJobsToProfile receives the same shape as before
  const rawUsers = await prisma.user.findMany({
    where: {
      subscription_status: { in: ['active', 'free'] },
      profile: { cv_filename: { not: null } },
    },
    select: {
      id: true, email: true, phone: true, name: true, plan: true,
      profile: {
        select: {
          skills: true, keywords: true, preferred_location: true,
          remote_preference: true, preferred_roles: true,
        },
      },
    },
  });

  // Flatten: { ...user, ...user.profile } — mirrors the original flat JOIN row
  const activeUsers = rawUsers.map(({ profile, ...user }) => ({ ...user, ...profile }));

  const jobs = await prisma.job.findMany({
    where:   { is_active: true },
    orderBy: { created_at: 'desc' },
    take:    500,
  });

  for (const user of activeUsers) {
    try {
      const matches    = await matchingService.matchJobsToProfile(user, jobs);
      const topMatches = matches.filter(j => j.match_score >= 60).slice(0, 5);

      if (topMatches.length > 0) {
        if (user.plan === 'pro') {
          const month = new Date().toISOString().slice(0, 7);

          const usageRecord = await prisma.usageLimit.findFirst({
            where:  { user_id: user.id, month },
            select: { applications_used: true },
          });
          const used = usageRecord?.applications_used || 0;

          if (used < 200) {
            for (const job of topMatches.slice(0, 3)) {
              const already = await prisma.application.findFirst({
                where:  { user_id: user.id, job_id: job.id },
                select: { id: true },
              });
              if (!already) {
                await prisma.application.create({
                  data: {
                    user_id:     user.id,
                    job_id:      job.id,
                    match_score: job.match_score,
                    status:      'sent',
                    applied_at:  new Date(),
                  },
                });

                // Replaces ON CONFLICT SQL — atomic upsert with increment
                // Requires @@unique([user_id, month]) on UsageLimit in schema
                await prisma.usageLimit.upsert({
                  where:  { user_id_month: { user_id: user.id, month } },
                  update: { applications_used: { increment: 1 } },
                  create: {
                    user_id:           user.id,
                    month,
                    applications_used: 1,
                    cv_used:           0,
                    cover_letters_used: 0,
                  },
                });

                notificationService.sendApplicationAlert(user, job).catch(console.error);
              }
            }
          }
        } else {
          // Notify non-pro users of matches
          notificationService.sendMatchAlert(user, topMatches.length).catch(console.error);
        }
      }
    } catch (err) {
      console.error(`Matching error for user ${user.id}:`, err.message);
    }
  }

  console.log(`✅ Job matching done for ${activeUsers.length} users`);
});

// ══════════════════════════════════════════════════════════════════════════════
//  DAILY SUMMARY EMAILS — every day at 8am Nairobi time (UTC+3 = 5am UTC)
// ══════════════════════════════════════════════════════════════════════════════
cron.schedule('0 5 * * *', async () => {
  console.log('📧 Sending daily summaries...');

  const users = await prisma.user.findMany({
    where: {
      subscription_status: { in: ['active', 'free'] },
    },
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
          where: { user_id: user.id },
        }),
        prisma.application.count({
          where: { user_id: user.id, created_at: { gte: today } },
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
});

console.log('⏰ Cron jobs started: job matching (every 6h) + daily summaries (8am EAT)');