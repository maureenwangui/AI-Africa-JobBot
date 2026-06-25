// routes/subscription.js — M-Pesa + Paystack Payment Integration
const express = require('express');
const axios   = require('axios');
const getDb   = require('../db/connection');
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

function getPlanAmount(plan, billing_cycle, currency = 'KES') {
  const kes = DISCOUNTS[billing_cycle]?.[plan];
  if (!kes) return null;
  if (currency === 'KES') return kes;
  return Math.round((kes / 130) * 100) / 100;
}

// ── GET /api/subscription/test-config ────────────────────────────────────────
// Use this to check if your payment keys are configured correctly
router.get('/test-config', (req, res) => {
  res.json({
    mpesa: {
      configured: !!(process.env.MPESA_CONSUMER_KEY && process.env.MPESA_CONSUMER_SECRET),
      env: process.env.MPESA_ENV || 'sandbox',
      shortcode: process.env.MPESA_SHORTCODE || 'not set',
    },
    paystack: {
      configured: !!process.env.PAYSTACK_SECRET_KEY,
      key_prefix: process.env.PAYSTACK_SECRET_KEY
        ? process.env.PAYSTACK_SECRET_KEY.slice(0, 12) + '...'
        : 'not set',
      mode: process.env.PAYSTACK_SECRET_KEY?.startsWith('sk_live') ? 'LIVE' : 'TEST',
    },
  });
});

// ── GET /api/subscription/plans ───────────────────────────────────────────────
router.get('/plans', (req, res) => {
  res.json({
    plans:   PLANS,
    pricing: {
      monthly: { starter: 500,  growth: 1200, pro: 2500  },
      '3mo':   { starter: 1300, growth: 3000, pro: 6200  },
      '6mo':   { starter: 2400, growth: 5600, pro: 10600 },
    },
    currency:        'KES',
    payment_methods: ['mpesa', 'paystack', 'card'],
  });
});

// ── GET /api/subscription/status ──────────────────────────────────────────────
router.get('/status', auth, (req, res) => {
  const db    = getDb();
  const sub   = db.prepare("SELECT * FROM subscriptions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1").get(req.user.id);
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

    if (!PLANS[plan])                  return res.status(400).json({ error: 'Invalid plan. Choose: starter, growth, or pro' });
    if (!BILLING_MULTIPLIER[billing_cycle]) return res.status(400).json({ error: 'Invalid billing cycle' });
    if (!phone)                        return res.status(400).json({ error: 'Phone number required for M-Pesa' });

    const amount = getPlanAmount(plan, billing_cycle, 'KES');
    if (!amount) return res.status(400).json({ error: 'Could not calculate amount' });

    // Format phone: 0712345678 or +254712345678 → 254712345678
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
      Password:          password,
      Timestamp:         timestamp,
      TransactionType:   'CustomerPayBillOnline',
      Amount:            amount,
      PartyA:            formattedPhone,
      PartyB:            shortcode,
      PhoneNumber:       formattedPhone,
      CallBackURL:       callbackUrl,
      AccountReference:  `JOBBOT-${req.user.id}-${plan.toUpperCase()}`,
      TransactionDesc:   `Africa JobBot ${PLANS[plan].name} Plan`,
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
      message:              'STK Push sent to your phone. Enter your M-Pesa PIN to complete payment.',
      checkout_request_id:  data.CheckoutRequestID,
      amount,
      phone: formattedPhone,
    });
  } catch (err) {
    console.error('M-Pesa error:', err.response?.data || err.message);
    if (err.message === 'M-Pesa credentials not configured') {
      return res.status(400).json({
        error: 'M-Pesa not configured. Add MPESA_CONSUMER_KEY and MPESA_CONSUMER_SECRET to .env',
        code:  'MPESA_NOT_CONFIGURED',
      });
    }
    res.status(500).json({ error: 'M-Pesa payment failed. Please try again.' });
  }
});

// POST /api/subscription/mpesa/check — poll payment status
router.post('/mpesa/check', auth, async (req, res) => {
  try {
    const { checkout_request_id } = req.body;
    const db  = getDb();
    const sub = db.prepare("SELECT * FROM subscriptions WHERE checkout_request_id = ? AND user_id = ?").get(checkout_request_id, req.user.id);
    if (!sub) return res.status(404).json({ error: 'Payment not found' });
    res.json({ status: sub.status, plan: sub.plan });
  } catch (err) {
    res.status(500).json({ error: 'Status check failed' });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
//  PAYSTACK  (Cards, Bank Transfer, M-Pesa, Airtel Money)
//  Docs: https://paystack.com/docs/api/transaction/
// ══════════════════════════════════════════════════════════════════════════════

// POST /api/subscription/paystack/initiate
router.post('/paystack/initiate', auth, async (req, res) => {
  try {
    const { plan, billing_cycle = 'monthly', currency = 'KES' } = req.body;

    if (!PLANS[plan]) return res.status(400).json({ error: 'Invalid plan. Choose: starter, growth, or pro' });
    if (!BILLING_MULTIPLIER[billing_cycle]) return res.status(400).json({ error: 'Invalid billing cycle' });

    const paystackKey = process.env.PAYSTACK_SECRET_KEY;
    if (!paystackKey) {
      return res.status(400).json({
        error: 'Paystack not configured. Add PAYSTACK_SECRET_KEY to .env',
        code:  'PAYSTACK_NOT_CONFIGURED',
      });
    }

    const amount   = getPlanAmount(plan, billing_cycle, 'KES');
    if (!amount) return res.status(400).json({ error: 'Could not calculate amount' });

    const txRef    = `JOBBOT-${req.user.id}-${plan}-${Date.now()}`;
    const planInfo = PLANS[plan];

    // Paystack requires amount in kobo/cents (multiply by 100)
    const { data } = await axios.post(
      'https://api.paystack.co/transaction/initialize',
      {
        email:        req.user.email,
        amount:       amount * 100,
        currency:     currency,
        reference:    txRef,
        callback_url: `${process.env.FRONTEND_URL || 'http://localhost:5500'}/payment-success.html`,
        metadata: {
          user_id:       req.user.id,
          plan:          plan,
          billing_cycle: billing_cycle,
          name:          req.user.name || req.user.email,
          custom_fields: [
            { display_name: 'Plan',         variable_name: 'plan',         value: planInfo.name  },
            { display_name: 'Billing Cycle', variable_name: 'billing_cycle', value: billing_cycle },
          ],
        },
      },
      {
        headers: {
          Authorization:  `Bearer ${paystackKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!data.status) {
      return res.status(400).json({ error: data.message || 'Paystack request failed' });
    }

    // Save pending subscription
    const db = getDb();
    db.prepare(`
      INSERT INTO subscriptions (user_id, plan, billing_cycle, provider, status, amount, currency, tx_ref)
      VALUES (?, ?, ?, 'paystack', 'pending', ?, ?, ?)
    `).run(req.user.id, plan, billing_cycle, amount, currency, txRef);

    res.json({
      payment_url:  data.data.authorization_url,
      access_code:  data.data.access_code,
      reference:    txRef,
      amount,
      currency,
    });
  } catch (err) {
    // Log the full error so we can see exactly what went wrong
    const errDetail = err.response?.data || err.message || err;
    console.error('Paystack initiate error FULL:', JSON.stringify(errDetail, null, 2));
    console.error('Paystack status:', err.response?.status);
    console.error('Paystack headers:', err.response?.headers);
    
    // Return specific error message to frontend
    const userMsg = err.response?.data?.message || err.message || 'Payment initiation failed';
    res.status(500).json({ 
      error: userMsg,
      detail: process.env.NODE_ENV !== 'production' ? errDetail : undefined,
    });
  }
});

// POST /api/subscription/paystack/verify — verify after redirect
router.post('/paystack/verify', auth, async (req, res) => {
  try {
    const { tx_ref, reference } = req.body;
    const paystackKey = process.env.PAYSTACK_SECRET_KEY;

    // Paystack verifies by reference, not transaction_id
    const ref = reference || tx_ref;
    if (!ref) return res.status(400).json({ error: 'reference is required' });

    const { data } = await axios.get(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(ref)}`,
      { headers: { Authorization: `Bearer ${paystackKey}` } }
    );

    const tx = data.data;
    // Paystack success status is 'success' (not 'successful' like Flutterwave)
    if (!data.status || tx.status !== 'success') {
      return res.status(400).json({ error: 'Payment not successful', status: tx?.status });
    }

    const db  = getDb();
    const sub = db.prepare("SELECT * FROM subscriptions WHERE tx_ref = ? AND user_id = ?").get(ref, req.user.id);
    if (!sub) return res.status(404).json({ error: 'Subscription record not found' });

    // Prevent double activation
    if (sub.status === 'active') {
      return res.json({ status: 'active', plan: sub.plan, message: 'Already activated' });
    }

    const months  = BILLING_MULTIPLIER[sub.billing_cycle] || 1;
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + months);

    db.prepare(`
      UPDATE subscriptions
      SET status = 'active', start_date = datetime('now'), end_date = ?,
          flw_transaction_id = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(endDate.toISOString(), String(tx.id), sub.id);

    db.prepare(`
      UPDATE users SET plan = ?, subscription_status = 'active', updated_at = datetime('now') WHERE id = ?
    `).run(sub.plan, req.user.id);

    res.json({
      status:  'active',
      plan:    sub.plan,
      message: `${PLANS[sub.plan]?.name || sub.plan} plan activated!`,
    });
  } catch (err) {
    console.error('Paystack verify error:', err.response?.data || err.message);
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