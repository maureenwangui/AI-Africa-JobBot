// routes/notifications.js
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { auth } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

router.get('/', auth, async (req, res) => {
  try {
    const notifs = await prisma.notification.findMany({
      where:   { user_id: req.user.id },
      orderBy: { created_at: 'desc' },
      take:    20,
    });
    res.json(notifs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Failed to fetch notifications' });
  }
});

router.patch('/read-all', auth, async (req, res) => {
  try {
    await prisma.notification.updateMany({
      where: { user_id: req.user.id },
      data:  { is_read: true },
    });
    res.json({ message: 'All marked read' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Failed to mark notifications read' });
  }
});

module.exports = router;