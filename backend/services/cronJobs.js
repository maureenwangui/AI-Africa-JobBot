// services/cronJobs.js
// Fixed: new PrismaClient() → shared singleton
// Fixed: subscription_status → subscriptionStatus (camelCase)
// Fixed: cv_filename → resumes relation (users now have resumes table)
// Fixed: Job query uses status: 'ACTIVE' not isActive: true
// Fixed: prisma.usageLimit → prisma.usage
// Fixed: application create uses camelCase and uppercase status enum
// Fixed: application findFirst uses camelCase fields
// Fixed: daily email query uses camelCase
const cron                   = require('node-cron');
const prisma                 = require('../confiq/prisma');
const aiService              = require('./aiService');
const emailService           = require('./emailService');
const notificationService    = require('./notificationService');
const matchingService        = require('./matchingService');

// ── Job Matching Cron — every 6 hours ─────────────────────────────────────────
cron.schedule('0 */6 * * *', async () => {
  console.log('⏰ Running job matching cron...');
  try {
    // Fixed: subscriptionStatus camelCase, FREE uppercase enum
    const users = await prisma.user.findMany({
      where: {
        NOT: { subscriptionStatus: 'CANCELLED' },
        plan: { not: 'FREE' },
        // Only users who have uploaded a CV
        resumes: { some: {} },
      },
      include: {
        profile: true,
        resumes: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    console.log(`🔍 Matching jobs for ${users.length} users...`);

    // Fixed: status: 'ACTIVE' not isActive: true
    const activeJobs = await prisma.job.findMany({
      where:   { status: 'ACTIVE' },
      include: { company: { select: { name: true } } },
      take:    500,
    });

    // Flatten company relation
    const flatJobs = activeJobs.map(j => ({ ...j, company: j.company?.name || '' }));

    for (const user of users) {
      try {
        if (!user.profile) continue;

        const matches = await matchingService.matchJobsToProfile(user.profile, flatJobs);
        if (!matches?.length) continue;

        const month = new Date().toISOString().slice(0, 7);

        // Fixed: plan limits from normalized lowercase plan
        const planKey = user.plan.toLowerCase();
        const maxApps = {
          starter: 20, growth: 80, pro: 200, free: 3
        }[planKey] || 3;

        // Fixed: prisma.usage not usageLimit, userId_month composite key
        const usage = await prisma.usage.findUnique({
          where: { userId_month: { userId: user.id, month } },
        });
        const used = usage?.applicationsUsed || 0;

        if (used >= maxApps) {
          console.log(`⏭  ${user.email}: limit reached (${used}/${maxApps})`);
          continue;
        }

        let applied = 0;

        for (const job of matches.slice(0, maxApps - used)) {
          try {
            // Fixed: camelCase fields, jobId as String
            const existing = await prisma.application.findFirst({
              where: { userId: user.id, jobId: String(job.id) },
            });
            if (existing) continue;

            // Fixed: camelCase fields, 'APPLIED' uppercase enum
            await prisma.application.create({
              data: {
                userId:               user.id,
                jobId:                String(job.id),
                status:               'APPLIED',
                appliedAt:            new Date(),
                appliedAutomatically: true,
                matchScore:           job.score || 0,
              },
            });

            // Fixed: prisma.usage upsert with camelCase + increment
            await prisma.usage.upsert({
              where:  { userId_month: { userId: user.id, month } },
              update: { applicationsUsed: { increment: 1 } },
              create: { userId: user.id, month, applicationsUsed: 1, resumesOptimized: 0, coverLettersGenerated: 0, aiCreditsUsed: 0 },
            });

            applied++;
          } catch (err) {
            console.error(`  ❌ Failed to apply for ${user.email} to ${job.title}:`, err.message);
          }
        }

        if (applied > 0) {
          console.log(`  ✅ ${user.email}: ${applied} applications sent`);
          await notificationService.sendMatchAlert(
            { id: user.id, email: user.email, name: user.name, phone: user.phone },
            matches.slice(0, applied)
          );
        }

      } catch (err) {
        console.error(`  ❌ Error matching for ${user.email}:`, err.message);
      }
    }

    console.log('✅ Job matching cron complete');
  } catch (err) {
    console.error('❌ Job matching cron failed:', err.message);
  }
});

// ── Daily Summary Email — 8am EAT (5am UTC) ───────────────────────────────────
cron.schedule('0 5 * * *', async () => {
  console.log('📧 Sending daily summaries...');
  try {
    const today    = new Date();
    today.setHours(0, 0, 0, 0);
    const month    = today.toISOString().slice(0, 7);

    // Fixed: subscriptionStatus camelCase, NOT FREE uppercase
    const users = await prisma.user.findMany({
      where: {
        plan: { not: 'FREE' },
        NOT: { subscriptionStatus: 'CANCELLED' },
      },
      select: { id: true, email: true, name: true, phone: true },
    });

    for (const user of users) {
      try {
        // Fixed: camelCase fields, APPLIED uppercase
        const [todayApps, totalApps, usage] = await Promise.all([
          prisma.application.count({ where: { userId: user.id, createdAt: { gte: today } } }),
          prisma.application.count({ where: { userId: user.id } }),
          prisma.usage.findUnique({ where: { userId_month: { userId: user.id, month } } }),
        ]);

        const stats = {
          applied:         todayApps,
          total_applied:   totalApps,
          this_month:      usage?.applicationsUsed || 0,
          date:            today.toLocaleDateString('en-KE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
        };

        await notificationService.sendDailySummary(user, stats);
      } catch (err) {
        console.error(`  ❌ Daily summary failed for ${user.email}:`, err.message);
      }
    }

    console.log(`✅ Daily summaries sent to ${users.length} users`);
  } catch (err) {
    console.error('❌ Daily summary cron failed:', err.message);
  }
});

console.log('⏰ Cron jobs started: job matching (every 6h) + daily summaries (8am EAT)');