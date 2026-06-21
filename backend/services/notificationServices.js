// services/notificationService.js
const getDb = require('../db/connection');
const emailService = require('./emailService');

// Store notification in DB
function storeNotification(userId, type, channel, title, message) {
  const db = getDb();
  db.prepare(`
    INSERT INTO notifications (user_id, type, channel, title, message, sent_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
  `).run(userId, type, channel, title, message);
}

// WhatsApp via Africa's Talking (or Twilio)
async function sendWhatsApp(phone, message) {
  if (!process.env.AT_API_KEY || !phone) return;
  try {
    const axios = require('axios');
    // Africa's Talking WhatsApp API
    await axios.post('https://api.africastalking.com/version1/messaging/whatsapp', {
      username: process.env.AT_USERNAME,
      to: phone,
      message,
    }, {
      headers: {
        apikey: process.env.AT_API_KEY,
        'Content-Type': 'application/json',
      },
    });
  } catch (err) {
    console.error('WhatsApp send error:', err.message);
  }
}

async function sendApplicationAlert(user, job) {
  const title = `Application Submitted: ${job.title}`;
  const message = `✅ Africa JobBot applied to *${job.title}* at *${job.company}* on your behalf. Check your dashboard for updates.`;

  storeNotification(user.id, 'application_submitted', 'email', title, message);
  emailService.sendApplicationAlert(user, job).catch(console.error);

  if (user.phone) {
    storeNotification(user.id, 'application_submitted', 'whatsapp', title, message);
    sendWhatsApp(user.phone, message).catch(console.error);
  }
}

async function sendMatchAlert(user, matchCount) {
  const message = `🎯 Africa JobBot found *${matchCount} new job matches* for you! Log in to review and approve applications: ${process.env.FRONTEND_URL}/dashboard`;
  storeNotification(user.id, 'new_matches', 'whatsapp', 'New Job Matches Found', message);
  if (user.phone) sendWhatsApp(user.phone, message).catch(console.error);
}

module.exports = { sendApplicationAlert, sendMatchAlert, storeNotification };