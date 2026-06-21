// routes/notifications.js
const express = require('express');
const getDb = require('../db/connection');
const { auth } = require('../middleware/auth');
const router = express.Router();

router.get('/', auth, (req, res) => {
  const db = getDb();
  const notifs = db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 20').all(req.user.id);
  res.json(notifs);
});

router.patch('/read-all', auth, (req, res) => {
  const db = getDb();
  db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(req.user.id);
  res.json({ message: 'All marked read' });
});

module.exports = router;
