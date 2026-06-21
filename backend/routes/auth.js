// routes/auth.js
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const getDb = require('../db/connection');
const { auth } = require('../middleware/auth');
const emailService = require('../services/emailService');

const router = express.Router();

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { email, password, name, phone } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

    const db = getDb();
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
    if (existing) return res.status(409).json({ error: 'Email already registered' });

    const hashed = await bcrypt.hash(password, 12);
    const result = db.prepare(`
      INSERT INTO users (email, password, name, phone, plan, subscription_status)
      VALUES (?, ?, ?, ?, 'free', 'inactive')
    `).run(email.toLowerCase(), hashed, name || '', phone || '');

    // Create empty profile
    db.prepare('INSERT INTO profiles (user_id) VALUES (?)').run(result.lastInsertRowid);

    const token = jwt.sign({ id: result.lastInsertRowid }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });

    // Welcome email
    emailService.sendWelcome(email, name).catch(console.error);

    res.status(201).json({
      token,
      user: { id: result.lastInsertRowid, email: email.toLowerCase(), name, plan: 'free' },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
    if (!user) return res.status(401).json({ error: 'Invalid email or password' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Invalid email or password' });

    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });

    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name, plan: user.plan, subscription_status: user.subscription_status },
    });
  } catch (err) {
    res.status(500).json({ error: 'Login failed' });
  }
});

// POST /api/auth/forgot-password
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    const db = getDb();
    const user = db.prepare('SELECT id, email, name FROM users WHERE email = ?').get(email?.toLowerCase());

    // Always return success to prevent email enumeration
    if (!user) return res.json({ message: 'If that email exists, a reset link has been sent.' });

    const resetToken = uuidv4();
    const expires = new Date(Date.now() + 3600000).toISOString(); // 1 hour

    db.prepare("UPDATE users SET reset_token = ?, reset_expires = ? WHERE id = ?")
      .run(resetToken, expires, user.id);

    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
    emailService.sendPasswordReset(user.email, user.name, resetUrl).catch(console.error);

    res.json({ message: 'If that email exists, a reset link has been sent.' });
  } catch (err) {
    res.status(500).json({ error: 'Request failed' });
  }
});

// POST /api/auth/reset-password
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ error: 'Token and password required' });

    const db = getDb();
    const user = db.prepare("SELECT * FROM users WHERE reset_token = ? AND reset_expires > datetime('now')").get(token);
    if (!user) return res.status(400).json({ error: 'Invalid or expired reset token' });

    const hashed = await bcrypt.hash(password, 12);
    db.prepare("UPDATE users SET password = ?, reset_token = NULL, reset_expires = NULL WHERE id = ?")
      .run(hashed, user.id);

    res.json({ message: 'Password reset successful' });
  } catch (err) {
    res.status(500).json({ error: 'Reset failed' });
  }
});

// GET /api/auth/me
router.get('/me', auth, (req, res) => {
  const db = getDb();
  const user = db.prepare('SELECT id, email, name, phone, plan, subscription_status, created_at FROM users WHERE id = ?').get(req.user.id);
  res.json(user);
});

module.exports = router;