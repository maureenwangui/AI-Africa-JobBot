// routes/subscription.js — M-Pesa + Flutterwave Payment Integration
const express = require('express');
const axios = require('axios');
const getDb = require('../db/connection');
const { auth } = require('../middleware/auth');

const router = express.Router();

// ─── Plan Config ──────────────────────────────────────────────────────────────
const PLANS = {
  starter: { name: 'Starter', usd: 4,  kes: 500,  applications: 20,  cv: 5,  cover_letters: 20  },
  growth:  { name: 'Growth',  usd: 9,  kes: 1200, applications: 80,  cv: 20, cover_letters: 80  },
  pro:     { name: 'Pro',     usd: 19, kes: 2500, applications: 200, cv: 50, cover_letters: 200 },
};

const BILLING_MULTIPLIER = { monthly: 1, '3mo': 3, '6mo': 6 };

const DISCOUNTS = {
  monthly: { starter: 500,  growth: 1200, pro: 2500  },
  '3mo':   { starter: 1300, growth: 3000, pro: 6200  },
  '6mo':   { starter: 2400, growth: 5600, pro: 10600 },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getPlanAmount(plan, billing_cycle, currency = 'KES') {
  const kes = DISCOUNTS[billing_cycle]?.[plan];
  if (!kes) return null;
  if (currency === 'KES') return kes;
  // Rough USD conversion (update rate as needed)
  return Math.round((kes / 130) * 100) / 100;
}

// ── GET /api/subscription/plans ───────────────────────────────────────────────
router.get('/plans', (req, res) => {
  res.json({
    plans: PLANS,
    pricing: {
      monthly: { starter: 500,  growth: 1200, pro: 2500  },
      '3mo':   { starter: 1300, growth: 3000, pro: 6200  },
      '6mo':   { starter: 2400, growth: 5600, pro: 10600 },
    },
    currency: 'KES',
    payment_methods: ['mpesa', 'flutterwave', 'card'],
  });
});

// ── GET /api/subscription/status ──────────────────────────────────────────────
router.get('/status', auth, (req, res) => {
  const db = getDb();
  const sub = db.prepare("SELECT * FROM subscriptions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1").get(req.user.id);
  const month = new Date().toISOString().slice(0, 7);
  const usage = db.prepare("SELECT * FROM usage_limits WHERE user_id = ? AND month = ?").get(req.user.id, month);
  res.json({ subscription: sub || null, usage: usage || null, plan: req.user.plan });
});

// ══════════════════════════════════════════════════════════════════════════════
//  M-PESA STK PUSH  (Safaricom Daraja API)
// ══════════════════════════════════════════════════════════════════════════════

async function getMpesaToken() {
  const key    = process.env.MPESA_CONSUMER_KEY;
  const secret = process.env.MPESA_CONSUMER_SECRET;
  if (!key || !secret) throw new Error('M-Pesa credentials not configured');
  const credentials = Buffer.from(`${key}:${secret}`).toString('base64');
  const url = process.env.MPESA_ENV === 'production'
    ? 'https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials'
    : 'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials';
  const { data } = await axios.get(url, { headers: { Authorization: `Basic ${credentials}` } });
  return data.access_token;
}

// POST /api/subscription/mpesa/initiate
router.post('/mpesa/initiate', auth, async (req, res) => {
  try {
    const { plan, billing_cycle = 'monthly', phone } = req.body;

    if (!PLANS[plan]) return res.status(400).json({ error: `Invalid plan. Choose: starter, growth, or pro` });
    if (!BILLING_MULTIPLIER[billing_cycle]) return res.status(400).json({ error: 'Invalid billing cycle' });
    if (!phone) return res.status(400).json({ error: 'Phone number required for M-Pesa' });

    const amount = getPlanAmount(plan, billing_cycle, 'KES');
    if (!amount) return res.status(400).json({ error: 'Could not calculate amount' });

    // Format phone: 0712345678 → 254712345678
    const formattedPhone = phone.replace(/^0/, '254').replace(/^\+/, '').replace(/\s/g, '');

    const token       = await getMpesaToken();
    const shortcode   = process.env.MPESA_SHORTCODE;
    const passkey     = process.env.MPESA_PASSKEY;
    const timestamp   = new Date().toISOString().replace(/[-T:.Z]/g, '').slice(0, 14);
    const password    = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');
    const callbackUrl = `${process.env.BACKEND_URL || 'https://your-app.onrender.com'}/api/webhooks/mpesa`;

    const mpesaUrl = process.env.MPESA_ENV === 'production'
      ? 'https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest'
      : 'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest';

    const { data } = await axios.post(mpesaUrl, {
      BusinessShortCode: shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: amount,
      PartyA: formattedPhone,
      PartyB: shortcode,
      PhoneNumber: formattedPhone,
      CallBackURL: callbackUrl,
      AccountReference: `JOBBOT-${req.user.id}-${plan.toUpperCase()}`,
      TransactionDesc: `Africa JobBot ${PLANS[plan].name} Plan`,
    }, { headers: { Authorization: `Bearer ${token}` } });

    if (data.ResponseCode !== '0') {
      return res.status(400).json({ error: data.ResponseDescription || 'M-Pesa request failed' });
    }

    // Save pending subscription
    const db = getDb();
    db.prepare(`
      INSERT INTO subscriptions (user_id, plan, billing_cycle, provider, status, amount, currency, checkout_request_id)
      VALUES (?, ?, ?, 'mpesa', 'pending', ?, 'KES', ?)
    `).run(req.user.id, plan, billing_cycle, amount, data.CheckoutRequestID);

    res.json({
      message: 'STK Push sent to your phone. Enter your M-Pesa PIN to complete payment.',
      checkout_request_id: data.CheckoutRequestID,
      amount,
      phone: formattedPhone,
    });
  } catch (err) {
    console.error('M-Pesa error:', err.response?.data || err.message);
    if (err.message === 'M-Pesa credentials not configured') {
      return res.status(400).json({ error: 'M-Pesa not configured. Add MPESA_CONSUMER_KEY and MPESA_CONSUMER_SECRET to .env', code: 'MPESA_NOT_CONFIGURED' });
    }
    res.status(500).json({ error: 'M-Pesa payment failed. Please try again.' });
  }
});

// POST /api/subscription/mpesa/check — poll payment status
router.post('/mpesa/check', auth, async (req, res) => {
  try {
    const { checkout_request_id } = req.body;
    const db = getDb();
    const sub = db.prepare("SELECT * FROM subscriptions WHERE checkout_request_id = ? AND user_id = ?").get(checkout_request_id, req.user.id);
    if (!sub) return res.status(404).json({ error: 'Payment not found' });
    res.json({ status: sub.status, plan: sub.plan });
  } catch (err) {
    res.status(500).json({ error: 'Status check failed' });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
//  FLUTTERWAVE  (Cards, Bank Transfer, M-Pesa, Airtel Money)
// ══════════════════════════════════════════════════════════════════════════════

// POST /api/subscription/flutterwave/initiate
router.post('/flutterwave/initiate', auth, async (req, res) => {
  try {
    const { plan, billing_cycle = 'monthly', currency = 'KES' } = req.body;

    if (!PLANS[plan]) return res.status(400).json({ error: 'Invalid plan. Choose: starter, growth, or pro' });
    if (!BILLING_MULTIPLIER[billing_cycle]) return res.status(400).json({ error: 'Invalid billing cycle' });

    const flwKey = process.env.FLUTTERWAVE_SECRET_KEY;
    if (!flwKey) return res.status(400).json({ error: 'Flutterwave not configured. Add FLUTTERWAVE_SECRET_KEY to .env', code: 'FLW_NOT_CONFIGURED' });

    const amount   = currency === 'KES' ? getPlanAmount(plan, billing_cycle, 'KES') : getPlanAmount(plan, billing_cycle, 'USD');
    const txRef    = `JOBBOT-${req.user.id}-${plan}-${Date.now()}`;
    const planInfo = PLANS[plan];

    const { data } = await axios.post('https://api.flutterwave.com/v3/payments', {
      tx_ref:       txRef,
      amount:       amount,
      currency:     currency,
      redirect_url: `${process.env.FRONTEND_URL || 'http://localhost:5500'}/payment-success.html`,
      customer: {
        email: req.user.email,
        name:  req.user.name || req.user.email,
      },
      customizations: {
        title:       'Africa JobBot',
        description: `${planInfo.name} Plan — ${billing_cycle}`,
        logo:        `${process.env.FRONTEND_URL || 'http://localhost:5500'}/logo.png`,
      },
      meta: {
        user_id:      req.user.id,
        plan:         plan,
        billing_cycle: billing_cycle,
      },
      payment_options: 'card,mpesa,banktransfer,airtelke',
    }, {
      headers: { Authorization: `Bearer ${flwKey}`, 'Content-Type': 'application/json' },
    });

    if (data.status !== 'success') {
      return res.status(400).json({ error: data.message || 'Flutterwave request failed' });
    }

    // Save pending subscription
    const db = getDb();
    db.prepare(`
      INSERT INTO subscriptions (user_id, plan, billing_cycle, provider, status, amount, currency, tx_ref)
      VALUES (?, ?, ?, 'flutterwave', 'pending', ?, ?, ?)
    `).run(req.user.id, plan, billing_cycle, amount, currency, txRef);

    res.json({
      payment_url: data.data.link,
      tx_ref:      txRef,
      amount,
      currency,
    });
  } catch (err) {
    console.error('Flutterwave error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Payment initiation failed. Please try again.' });
  }
});

// POST /api/subscription/flutterwave/verify — verify after redirect
router.post('/flutterwave/verify', auth, async (req, res) => {
  try {
    const { tx_ref, transaction_id } = req.body;
    const flwKey = process.env.FLUTTERWAVE_SECRET_KEY;

    const { data } = await axios.get(
      `https://api.flutterwave.com/v3/transactions/${transaction_id}/verify`,
      { headers: { Authorization: `Bearer ${flwKey}` } }
    );

    const tx = data.data;
    if (data.status !== 'success' || tx.status !== 'successful') {
      return res.status(400).json({ error: 'Payment not successful', status: tx?.status });
    }

    const db  = getDb();
    const sub = db.prepare("SELECT * FROM subscriptions WHERE tx_ref = ? AND user_id = ?").get(tx_ref, req.user.id);
    if (!sub) return res.status(404).json({ error: 'Subscription record not found' });

    // Activate subscription
    const months   = BILLING_MULTIPLIER[sub.billing_cycle] || 1;
    const endDate  = new Date();
    endDate.setMonth(endDate.getMonth() + months);

    db.prepare(`
      UPDATE subscriptions
      SET status = 'active', start_date = datetime('now'), end_date = ?, flw_transaction_id = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(endDate.toISOString(), transaction_id, sub.id);

    db.prepare(`
      UPDATE users SET plan = ?, subscription_status = 'active', updated_at = datetime('now') WHERE id = ?
    `).run(sub.plan, req.user.id);

    res.json({ status: 'active', plan: sub.plan, message: `${PLANS[sub.plan].name} plan activated!` });
  } catch (err) {
    console.error('Flutterwave verify error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Verification failed' });
  }
});

// POST /api/subscription/cancel
router.post('/cancel', auth, async (req, res) => {
  const db  = getDb();
  const sub = db.prepare("SELECT * FROM subscriptions WHERE user_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1").get(req.user.id);
  if (!sub) return res.status(404).json({ error: 'No active subscription found' });
  db.prepare("UPDATE subscriptions SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?").run(sub.id);
  db.prepare("UPDATE users SET subscription_status = 'cancelled', updated_at = datetime('now') WHERE id = ?").run(req.user.id);
  res.json({ message: 'Subscription cancelled. Access continues until period end.' });
});

module.exports = router;