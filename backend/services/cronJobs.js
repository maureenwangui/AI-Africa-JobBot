// services/cronJobs.js
const cron = require('node-cron');
const getDb = require('../db/connection');
const matchingService = require('./matchingService');
const notificationService = require('./notificationService');
const emailService = require('./emailService');

// Run job matching for all active users — every 6 hours
cron.schedule('0 */6 * * *', async () => {
  console.log('🤖 Running job matching cycle...');
  const db = getDb();

  const activeUsers = db.prepare(`
    SELECT u.id, u.email, u.phone, u.name, u.plan,
           p.skills, p.keywords, p.preferred_location, p.remote_preference, p.preferred_roles
    FROM users u
    JOIN profiles p ON u.id = p.user_id
    WHERE u.subscription_status IN ('active', 'free')
    AND p.cv_filename IS NOT NULL
  `).all();

  const jobs = db.prepare('SELECT * FROM jobs WHERE is_active = 1 ORDER BY created_at DESC LIMIT 500').all();

  for (const user of activeUsers) {
    try {
      const matches = await matchingService.matchJobsToProfile(user, jobs);
      const topMatches = matches.filter(j => j.match_score >= 60).slice(0, 5);

      if (topMatches.length > 0) {
        // Auto-queue applications for pro users
        if (user.plan === 'pro') {
          const month = new Date().toISOString().slice(0, 7);
          const usage = db.prepare('SELECT applications_used FROM usage_limits WHERE user_id = ? AND month = ?').get(user.id, month);
          const used = usage?.applications_used || 0;

          if (used < 200) {
            for (const job of topMatches.slice(0, 3)) {
              const already = db.prepare('SELECT id FROM applications WHERE user_id = ? AND job_id = ?').get(user.id, job.id);
              if (!already) {
                db.prepare(`
                  INSERT INTO applications (user_id, job_id, match_score, status, applied_at)
                  VALUES (?, ?, ?, 'sent', datetime('now'))
                `).run(user.id, job.id, job.match_score);

                db.prepare(`
                  INSERT INTO usage_limits (user_id, month, applications_used) VALUES (?, ?, 1)
                  ON CONFLICT(user_id, month) DO UPDATE SET applications_used = applications_used + 1
                `).run(user.id, month);

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

// Send daily summary emails — every day at 8am Nairobi time (UTC+3 = 5am UTC)
cron.schedule('0 5 * * *', async () => {
  console.log('📧 Sending daily summaries...');
  const db = getDb();
  const users = db.prepare("SELECT id, email, name, phone, plan FROM users WHERE subscription_status IN ('active', 'free')").all();

  for (const user of users) {
    try {
      const stats = {
        total_applications: db.prepare("SELECT COUNT(*) as c FROM applications WHERE user_id = ?").get(user.id).c,
        new_matches: db.prepare("SELECT COUNT(*) as c FROM applications WHERE user_id = ? AND date(created_at) = date('now')").get(user.id).c,
      };
      emailService.sendDailySummary(user, stats).catch(console.error);
    } catch {}
  }
  console.log('✅ Daily summaries sent');
});

console.log('⏰ Cron jobs started: job matching (every 6h) + daily summaries (8am EAT)');
