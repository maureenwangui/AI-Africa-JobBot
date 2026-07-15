// routes/notifications.js
// Fixed: new PrismaClient() → shared singleton
// Fixed: user_id → userId (camelCase)
// Fixed: created_at → createdAt (camelCase)
// Fixed: is_read → isRead (camelCase)
const express  = require('express');
const prisma   = require('../confiq/prisma');
const { auth } = require('../middleware/auth');

const router = express.Router();

// GET /api/notifications
router.get('/', auth, async (req, res) => {
  try {
    const notifications = await prisma.notification.findMany({
      where:   { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      take:    50,
    });

    res.json(notifications.map(n => ({
      id:         n.id,
      user_id:    n.userId,
      title:      n.title,
      message:    n.message,
      type:       n.type,
      channel:    n.channel?.toLowerCase(),
      is_read:    n.isRead,
      read_at:    n.readAt,
      created_at: n.createdAt,
    })));
  } catch (err) {
    console.error('Notifications error:', err.message);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// PATCH /api/notifications/read-all
router.patch('/read-all', auth, async (req, res) => {
  try {
    await prisma.notification.updateMany({
      where: { userId: req.user.id, isRead: false },
      data:  { isRead: true, readAt: new Date() },
    });
    res.json({ message: 'All notifications marked as read' });
  } catch (err) {
    console.error('Mark read error:', err.message);
    res.status(500).json({ error: 'Failed to mark notifications as read' });
  }
});

// PATCH /api/notifications/:id/read
router.patch('/:id/read', auth, async (req, res) => {
  try {
    await prisma.notification.updateMany({
      where: { id: String(req.params.id), userId: req.user.id },
      data:  { isRead: true, readAt: new Date() },
    });
    res.json({ message: 'Notification marked as read' });
  } catch (err) {
    console.error('Mark read error:', err.message);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

module.exports = router;