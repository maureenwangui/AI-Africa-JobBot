// services/notificationService.js
const getDb = require('../db/connection');

async function sendApplicationAlert(user, job) {
  const db = getDb();

  db.prepare(`
    INSERT INTO notifications (user_id, type, channel, title, message, created_at)
    VALUES (?, 'application', 'system', ?, ?, datetime('now'))
  `).run(
    user.id,
    `Applied: ${job.title}`,
    `You applied to ${job.title} at ${job.company}`
  );

  console.log('Notification saved');
}

async function sendMatchAlert(user, count) {
  const db = getDb();

  db.prepare(`
    INSERT INTO notifications (user_id, type, channel, title, message, created_at)
    VALUES (?, 'match', 'system', ?, ?, datetime('now'))
  `).run(
    user.id,
    'New Job Matches',
    `You have ${count} new job matches`
  );

  console.log('Match notification saved');
}

module.exports = {
  sendApplicationAlert,
  sendMatchAlert
};