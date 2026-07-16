// server.js — Africa JobBot Production Server
require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const morgan     = require('morgan');
const rateLimit  = require('express-rate-limit');
const path       = require('path');
const fs         = require('fs');

const app  = express();
const PORT = process.env.PORT || 5000;

app.set('trust proxy', 1);

// ─── Security ─────────────────────────────────────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy:    false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' }, // Allow CV downloads from Netlify
  })
);

app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (mobile apps, curl, Postman)
    if (!origin) return callback(null, true);

    const allowed = [
      process.env.FRONTEND_URL,
      'https://africa-jobbot.netlify.app',
      'https://ai-africa-jobbot.onrender.com',
      'http://localhost:3000',
      'http://localhost:5500',
      'http://127.0.0.1:5500',
      'http://localhost:5501',
      'http://127.0.0.1:5501',
      'http://localhost:8080',
    ].filter(Boolean);

    if (allowed.indexOf(origin) !== -1) return callback(null, true);

    // Allow any localhost port in development
    if (process.env.NODE_ENV !== 'production' && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      return callback(null, true);
    }
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

// ─── Rate Limiting ────────────────────────────────────────────────────────────
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  handler: (req, res) => res.status(429).json({
    error: 'Too many login attempts. Please wait 15 minutes and try again.',
  }),
});
app.use('/api/', limiter);
app.use('/api/auth/', authLimiter);

// ─── Logging ──────────────────────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'production') app.use(morgan('dev'));

// ─── Body Parsing ─────────────────────────────────────────────────────────────
// Webhooks use their own express.json() per route
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── Static Files — CV uploads ───────────────────────────────────────────────
// Serves files from backend/uploads/ at /uploads/...
// Netlify frontend downloads CVs directly from:

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

app.use('/uploads', (req, res, next) => {
  // Allow cross-origin downloads from Netlify
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  next();
}, express.static(uploadsDir));

// Serve frontend (for local development)
app.use(express.static(path.join(__dirname, '../frontend')));

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth',          require('./routes/auth'));
app.use('/api/profile',       require('./routes/profile'));
app.use('/api/jobs',          require('./routes/jobs'));
app.use('/api/applications',  require('./routes/applications'));
app.use('/api/subscription',  require('./routes/subscription'));
app.use('/api/dashboard',     require('./routes/dashboard'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/admin',         require('./routes/admin'));
app.use('/api/webhooks',      require('./routes/webhooks'));
app.use('/api/ai',            require('./routes/ai'));

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({
  status:  'ok',
  service: 'Africa JobBot API',
  version: '1.0.0',
}));

// ─── Global Error Handler ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
  });
});

// ─── Start Cron Jobs ──────────────────────────────────────────────────────────
require('./services/cronJobs');

// ─── Keep Render awake — ping every 10 minutes ───────────────────────────────
if (process.env.NODE_ENV === 'production') {
  setInterval(() => {
    const url = (process.env.BACKEND_URL || 'https://ai-africa-jobbot.onrender.com') + '/health';
    fetch(url).catch(() => {});
  }, 10 * 60 * 1000);
}

// ─── Connect to PostgreSQL via Prisma ────────────────────────────────────────
const prisma = require('./confiq/prisma');
prisma.$connect()
  .then(() => console.log('✅ Connected to PostgreSQL via Prisma'))
  .catch(err => console.error('❌ Database connection failed:', err.message));

app.listen(PORT, () => {
  console.log(`🚀 Africa JobBot API running on port ${PORT}`);
});

module.exports = app;