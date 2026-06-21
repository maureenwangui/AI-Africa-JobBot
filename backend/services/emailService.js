// services/emailService.js
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: Number(process.env.EMAIL_PORT) || 587,
  secure: false,
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
});

async function send(to, subject, html) {
  return transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to,
    subject,
    html
  });
}

const baseStyle = `font-family:Arial,sans-serif;background:#041B3D;color:#fff;padding:30px;border-radius:12px;max-width:600px;margin:0 auto`;
const btn = (url, text) => `<a href="${url}" style="display:inline-block;background:#1E88E5;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;margin-top:16px">${text}</a>`;

async function sendWelcome(email, name) {
  return send(email, '🎉 Welcome to Africa JobBot!', `
    <div style="${baseStyle}">
      <h2 style="color:#42A5F5">Welcome to Africa JobBot${name ? ', ' + name : ''}! 🚀</h2>
      <p>Your AI job agent is ready. Here's what happens next:</p>
      <ol style="color:#90CAF9;line-height:1.8">
        <li>Upload your CV to complete your profile</li>
        <li>Our AI extracts your skills and starts matching jobs</li>
        <li>We apply to matching jobs on your behalf</li>
        <li>You receive alerts for every application</li>
      </ol>
      ${btn(process.env.FRONTEND_URL + '/dashboard', 'Go to Dashboard')}
      <p style="color:#90CAF9;font-size:12px;margin-top:20px">Africa JobBot — Apply to Hundreds of Jobs Without Lifting a Finger</p>
    </div>
  `);
}

async function sendApplicationAlert(user, job) {
  return send(user.email, `✅ Application Submitted: ${job.title} at ${job.company}`, `
    <div style="${baseStyle}">
      <h2 style="color:#42A5F5">Application Submitted! ✅</h2>
      <p>Your AI agent just applied to a new job on your behalf:</p>
      <div style="background:rgba(255,255,255,0.08);border-radius:8px;padding:16px;margin:16px 0">
        <strong style="color:#fff">${job.title}</strong><br>
        <span style="color:#90CAF9">${job.company} · ${job.location || 'Kenya'}</span>
      </div>
      ${btn(process.env.FRONTEND_URL + '/dashboard', 'View Dashboard')}
    </div>
  `);
}

async function sendPasswordReset(email, name, resetUrl) {
  return send(email, '🔑 Reset Your Africa JobBot Password', `
    <div style="${baseStyle}">
      <h2 style="color:#42A5F5">Password Reset Request</h2>
      <p>Hi ${name || 'there'}, click below to reset your password. Link expires in 1 hour.</p>
      ${btn(resetUrl, 'Reset Password')}
      <p style="color:#90CAF9;font-size:12px;margin-top:16px">If you didn't request this, ignore this email.</p>
    </div>
  `);
}

async function sendDailySummary(user, stats) {
  return send(user.email, `📊 Your Daily JobBot Summary`, `
    <div style="${baseStyle}">
      <h2 style="color:#42A5F5">Your Daily Summary 📊</h2>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:16px 0">
        <div style="background:rgba(255,255,255,0.08);border-radius:8px;padding:16px;text-align:center">
          <div style="font-size:2rem;font-weight:bold;color:#42A5F5">${stats.total_applications}</div>
          <div style="color:#90CAF9;font-size:12px">Total Applications</div>
        </div>
        <div style="background:rgba(255,255,255,0.08);border-radius:8px;padding:16px;text-align:center">
          <div style="font-size:2rem;font-weight:bold;color:#42A5F5">${stats.new_matches}</div>
          <div style="color:#90CAF9;font-size:12px">New Job Matches</div>
        </div>
      </div>
      ${btn(process.env.FRONTEND_URL + '/dashboard', 'View Full Dashboard')}
    </div>
  `);
}

module.exports = { sendWelcome, sendApplicationAlert, sendPasswordReset, sendDailySummary };