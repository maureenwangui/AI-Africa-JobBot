// services/notificationService.js

const getDb = require('../db/connection');
const axios = require('axios');
const emailService = require('./emailService');

/* =========================
   DB LAYER
========================= */
function saveNotification({ userId, type, channel, title, message }) {
  const db = getDb();

  db.prepare(`
    INSERT INTO notifications (user_id, type, channel, title, message, created_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
  `).run(userId, type, channel, title, message);
}

/* =========================
   WHATSAPP SERVICE
========================= */
async function sendWhatsApp(phone, message) {
  if (!process.env.AT_API_KEY || !phone) return;

  try {
    await axios.post(
      'https://api.africastalking.com/version1/messaging/whatsapp',
      {
        username: process.env.AT_USERNAME,
        to: phone,
        message,
      },
      {
        headers: {
          apikey: process.env.AT_API_KEY,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (err) {
    console.error('WhatsApp failed:', err.message);
  }
}

/* =========================
   EMAIL SERVICE
========================= */
async function sendEmail(user, subject, message) {
  try {
    await emailService.sendApplicationAlert(user, {
      subject,
      message,
    });
  } catch (err) {
    console.error('Email failed:', err.message);
  }
}

/* =========================
   SAFE RUN (RETRY LOGIC)
========================= */
async function safeRun(fn, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === retries) console.error('Final failure:', err.message);
    }
  }
}

/* =========================
   MAIN ALERTS
========================= */
async function sendApplicationAlert(user, job) {
  const title = `Applied: ${job.title}`;
  const message = `We applied to ${job.title} at ${job.company}`;

  // DB log
  saveNotification({
    userId: user.id,
    type: 'application',
    channel: 'system',
    title,
    message,
  });

  // Email
  if (user.email) {
    await safeRun(() => sendEmail(user, title, message));
  }

  // WhatsApp
  if (user.phone) {
    await safeRun(() => sendWhatsApp(user.phone, message));
  }
}

async function sendMatchAlert(user, count) {
  const title = 'New Job Matches';
  const message = `You have ${count} new job matches`;

  saveNotification({
    userId: user.id,
    type: 'match',
    channel: 'system',
    title,
    message,
  });

  if (user.phone) {
    await safeRun(() =>
      sendWhatsApp(user.phone, `🎯 ${message}`)
    );
  }
}

/* =========================
   EXPORTS
========================= */
module.exports = {
  sendApplicationAlert,
  sendMatchAlert,
};