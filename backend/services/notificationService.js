// services/notificationService.js

const { PrismaClient } = require('@prisma/client');
const axios = require('axios');
const emailService = require('./emailService');

const prisma = new PrismaClient();

/* =========================
   DB LAYER
========================= */
async function saveNotification({ userId, type, channel, title, message }) {
  await prisma.notification.create({
    data: {
      user_id:    userId,
      type,
      channel,
      title,
      message,
      created_at: new Date(),
    },
  });
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
        to:       phone,
        message,
      },
      {
        headers: {
          apikey:          process.env.AT_API_KEY,
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
    await emailService.sendApplicationAlert(user, { subject, message });
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
  const title   = `Applied: ${job.title}`;
  const message = `We applied to ${job.title} at ${job.company}`;

  // DB log — now awaited since saveNotification is async
  await saveNotification({
    userId:  user.id,
    type:    'application',
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
  const title   = 'New Job Matches';
  const message = `You have ${count} new job matches`;

  // DB log — now awaited since saveNotification is async
  await saveNotification({
    userId:  user.id,
    type:    'match',
    channel: 'system',
    title,
    message,
  });

  if (user.phone) {
    await safeRun(() => sendWhatsApp(user.phone, `🎯 ${message}`));
  }
}

/* =========================
   EXPORTS
========================= */
module.exports = {
  sendApplicationAlert,
  sendMatchAlert,
};