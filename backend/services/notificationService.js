// services/notificationService.js
// Fixed: new PrismaClient() → shared singleton
// Fixed: notification.create uses userId (camelCase) not user_id
// Fixed: Notification schema has no 'type' field — has 'channel' and 'status' enums
// Fixed: channel must be NotificationChannel enum: EMAIL, WHATSAPP, SMS, DASHBOARD
// Fixed: status must be NotificationStatus enum: PENDING, SENT, FAILED, READ
const prisma = require('../confiq/prisma');
const emailService = require('./emailService');

// Try to load Africa's Talking — optional dependency
let africastalking = null;
try {
  africastalking = require('africastalking')({
    apiKey:   process.env.AT_API_KEY,
    username: process.env.AT_USERNAME,
  });
} catch {}

// Save notification to DB
// Fixed: userId camelCase, channel/status are Prisma enums (uppercase)
async function saveNotification(userId, { title, message, channel = 'DASHBOARD', type = null }) {
  try {
    await prisma.notification.create({
      data: {
        userId,
        title,
        message,
        type,
        channel:  channel.toUpperCase(),
        status:   'SENT',
        isRead:   false,
      },
    });
  } catch (err) {
    console.error('Save notification error:', err.message);
  }
}

// Send WhatsApp via Africa's Talking
async function sendWhatsApp(phone, message) {
  if (!africastalking || !process.env.AT_API_KEY || process.env.AT_API_KEY === 'EXAMPLE_AFRICASTALKING_KEY') {
    console.log('WhatsApp not configured — skipping');
    return;
  }
  try {
    const sms = africastalking.SMS;
    await sms.send({ to: [phone], message, from: 'JOBBOT' });
    console.log(`📱 WhatsApp sent to ${phone}`);
  } catch (err) {
    console.error('WhatsApp error:', err.message);
  }
}

// Send application submitted alert
async function sendApplicationAlert(user, job) {
  if (!user || !job) return;

  const title   = `Application Submitted — ${job.title}`;
  const message = `Your AI agent just applied to ${job.title} at ${job.company || job.company?.name || ''}. Log in to track your application.`;

  // Save to dashboard
  await saveNotification(user.id, { title, message, channel: 'DASHBOARD', type: 'application_submitted' });

  // Email — fire and forget
  if (user.email) {
    emailService.sendApplicationAlert(user.email, user.name, job).catch(err =>
      console.error('Application email error (non-fatal):', err.message)
    );
  }

  // WhatsApp — fire and forget
  if (user.phone) {
    sendWhatsApp(user.phone, `✅ ${message}`).catch(err =>
      console.error('WhatsApp error (non-fatal):', err.message)
    );
  }
}

// Send job match alert
async function sendMatchAlert(user, matches) {
  if (!user || !matches?.length) return;

  const title   = `${matches.length} New Job Matches Found`;
  const message = `Your AI agent found ${matches.length} jobs matching your profile. Top match: ${matches[0]?.title || 'See dashboard'}.`;

  await saveNotification(user.id, { title, message, channel: 'DASHBOARD', type: 'job_match' });

  if (user.email) {
    emailService.sendMatchSummary(user.email, user.name, matches).catch(err =>
      console.error('Match email error (non-fatal):', err.message)
    );
  }

  if (user.phone) {
    sendWhatsApp(user.phone, `🎯 ${message} Login to apply: ${process.env.FRONTEND_URL}`).catch(() => {});
  }
}

// Send daily summary
async function sendDailySummary(user, stats) {
  if (!user) return;

  const title   = `Daily Job Search Summary`;
  const message = `Today: ${stats.applied || 0} applications sent, ${stats.matches || 0} new matches found.`;

  await saveNotification(user.id, { title, message, channel: 'EMAIL', type: 'daily_summary' });

  if (user.email) {
    emailService.sendDailySummary(user.email, user.name, stats).catch(err =>
      console.error('Daily summary email error (non-fatal):', err.message)
    );
  }
}

module.exports = { sendApplicationAlert, sendMatchAlert, sendDailySummary, saveNotification };