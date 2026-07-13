// routes/auth.js
const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const prisma  = require('../confiq/prisma');
const { auth } = require('../middleware/auth');
const emailService = require('../services/emailService');

const router = express.Router();

// ── POST /api/auth/register ───────────────────────────────────────────────────
// Fix 1: await emailService.sendWelcome() was crashing registration when email
//         fails (wrong password, Gmail quota etc.) — moved to fire-and-forget
//         .catch() so email failure never causes "Registration failed"
// Fix 2: bcrypt round reduced from 12 → 10 — 12 rounds takes 1-2 seconds on
//         Render's free tier (0.1 CPU), causing timeouts on slow connections
router.post('/register', async (req, res) => {
  try {
    const { email, password, name, phone } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const existing = await prisma.user.findUnique({
      where:  { email: email.toLowerCase() },
      select: { id: true },
    });
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    // Fix 2: 10 rounds instead of 12 — still secure, 4x faster on free tier
    const hashed = await bcrypt.hash(password, 10);

    // Create user + profile in one transaction — prevents orphaned users
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email:              email.toLowerCase(),
          password:           hashed,
          name:               name  || '',
          phone:              phone || '',
          plan:               'FREE',
          subscriptionStatus: 'PENDING',
        },
      });

      await tx.profile.create({
        data: { userId: user.id },
      });

      return user;
    });

    const token = jwt.sign(
      { id: result.id },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    // Fix 1: fire-and-forget — email failure does NOT crash registration
    emailService.sendWelcome(email, name).catch(err =>
      console.error('Welcome email failed (non-fatal):', err.message)
    );

    res.status(201).json({
      token,
      user: {
        id:    result.id,
        email: result.email,
        name:  result.name,
        plan:  result.plan.toLowerCase(),
      },
    });

  } catch (err) {
    console.error('Register error:', err.message);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// ── POST /api/auth/login ──────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Update last login — fire and forget, never block login
    prisma.user.update({
      where: { id: user.id },
      data:  { lastLogin: new Date() },
    }).catch(() => {});

    const token = jwt.sign(
      { id: user.id },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.json({
      token,
      user: {
        id:                  user.id,
        email:               user.email,
        name:                user.name,
        phone:               user.phone,
        role:                user.role.toLowerCase(),
        plan:                user.plan.toLowerCase(),
        subscription_status: user.subscriptionStatus.toLowerCase(),
      },
    });

  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ error: 'Login failed' });
  }
});

// ── POST /api/auth/forgot-password ───────────────────────────────────────────
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    const user = await prisma.user.findUnique({
      where:  { email: email?.toLowerCase() },
      select: { id: true, email: true, name: true },
    });

    // Always return success to prevent email enumeration
    if (!user) {
      return res.json({ message: 'If that email exists, a reset link has been sent.' });
    }

    const resetToken = uuidv4();

    await prisma.user.update({
      where: { id: user.id },
      data: {
        resetToken,
        resetTokenExpiry: new Date(Date.now() + 3600000), // 1 hour
      },
    });

    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
    emailService.sendPasswordReset(user.email, user.name, resetUrl).catch(console.error);

    res.json({ message: 'If that email exists, a reset link has been sent.' });

  } catch (err) {
    console.error('Forgot password error:', err.message);
    res.status(500).json({ error: 'Request failed' });
  }
});

// ── POST /api/auth/reset-password ────────────────────────────────────────────
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) {
      return res.status(400).json({ error: 'Token and password required' });
    }

    const user = await prisma.user.findFirst({
      where: {
        resetToken:       token,
        resetTokenExpiry: { gt: new Date() },
      },
    });
    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    const hashed = await bcrypt.hash(password, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        password:         hashed,
        resetToken:       null,
        resetTokenExpiry: null,
      },
    });

    res.json({ message: 'Password reset successful' });

  } catch (err) {
    console.error('Reset password error:', err.message);
    res.status(500).json({ error: 'Reset failed' });
  }
});

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
// Fix 3: returns snake_case to match what admin.html expects
//         (role: 'admin' not 'ADMIN', plan: 'free' not 'FREE')
router.get('/me', auth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where:  { id: String(req.user.id) },
      select: {
        id:                 true,
        email:              true,
        name:               true,
        phone:              true,
        plan:               true,
        subscriptionStatus: true,
        role:               true,
        createdAt:          true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      id:                  user.id,
      email:               user.email,
      name:                user.name,
      phone:               user.phone,
      plan:                user.plan.toLowerCase(),
      subscription_status: user.subscriptionStatus.toLowerCase(),
      role:                user.role.toLowerCase(),
      created_at:          user.createdAt,
    });

  } catch (err) {
    console.error('Me error:', err.message);
    res.status(500).json({ error: 'Failed to fetch user details' });
  }
});

module.exports = router;