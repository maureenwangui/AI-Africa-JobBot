// routes/subscription.js — Full PayPal Integration
const express = require('express');
const axios = require('axios');
const getDb = require('../db/connection');
const { auth } = require('../middleware/auth');

const router = express.Router();

const PAYPAL_BASE = process.env.PAYPAL_MODE === 'live'
  ? 'https://api-m.paypal.com'
  : 'https://api-m.sandbox.paypal.com';

// ─── PayPal Token ─────────────────────────────────────────────────────────────
async function getPayPalToken() {
  const res = await axios.post(`${PAYPAL_BASE}/v1/oauth2/token`,
    'grant_type=client_credentials',
    {
      auth: { username: process.env.PAYPAL_CLIENT_ID, password: process.env.PAYPAL_CLIENT_SECRET },
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    }
  );
  return res.data.access_token;
}

// Plan ID map
const PLAN_IDS = {
  starter_monthly: process.env.PAYPAL_PLAN_STARTER_MONTHLY,
  growth_monthly:  process.env.PAYPAL_PLAN_GROWTH_MONTHLY,
  pro_monthly:     process.env.PAYPAL_PLAN_PRO_MONTHLY,
  starter_3mo:     process.env.PAYPAL_PLAN_STARTER_3MO,
  growth_3mo:      process.env.PAYPAL_PLAN_GROWTH_3MO,
  pro_3mo:         process.env.PAYPAL_PLAN_PRO_3MO,
  starter_6mo:     process.env.PAYPAL_PLAN_STARTER_6MO,
  growth_6mo:      process.env.PAYPAL_PLAN_GROWTH_6MO,
  pro_6mo:         process.env.PAYPAL_PLAN_PRO_6MO,
};

const PLAN_AMOUNTS = {
  starter_monthly: 4,   growth_monthly: 9,   pro_monthly: 19,
  starter_3mo: 10,      growth_3mo: 24,      pro_3mo: 50,
  starter_6mo: 18,      growth_6mo: 45,      pro_6mo: 85,
};

// GET /api/subscription/plans — return all plan info to frontend
router.get('/plans', (req, res) => {
  res.json({
    monthly: {
      starter: { price: 4,  kes: 500,  plan_id: PLAN_IDS.starter_monthly, applications: 20,  features: ['20 applications/mo', 'Basic AI CV', '1 cover letter/job', 'WhatsApp daily summary'] },
      growth:  { price: 9,  kes: 1200, plan_id: PLAN_IDS.growth_monthly,  applications: 80,  features: ['80 applications/mo', 'ATS CV optimization', 'Unlimited cover letters', 'AI job matching', 'WhatsApp + email alerts'] },
      pro:     { price: 19, kes: 2500, plan_id: PLAN_IDS.pro_monthly,     applications: 200, features: ['200+ applications/mo', 'Priority AI matching', 'Full auto-apply AI', 'Interview tracking AI', '"Apply Until Hired" mode'] },
    },
    '3mo': {
      starter: { price: 10, plan_id: PLAN_IDS.starter_3mo },
      growth:  { price: 24, plan_id: PLAN_IDS.growth_3mo  },
      pro:     { price: 50, plan_id: PLAN_IDS.pro_3mo     },
    },
    '6mo': {
      starter: { price: 18, plan_id: PLAN_IDS.starter_6mo },
      growth:  { price: 45, plan_id: PLAN_IDS.growth_6mo  },
      pro:     { price: 85, plan_id: PLAN_IDS.pro_6mo     },
    },
  });
});

// POST /api/subscription/create — create PayPal subscription
router.post('/create', auth, async (req, res) => {
  try {
    const { plan, billing_cycle = 'monthly' } = req.body;
    const key = `${plan}_${billing_cycle}`;
    const planId = PLAN_IDS[key];
    if (!planId) return res.status(400).json({ error: 'Invalid plan or billing cycle' });

    const token = await getPayPalToken();

    const subscription = await axios.post(`${PAYPAL_BASE}/v1/billing/subscriptions`, {
      plan_id: planId,
      subscriber: {
        email_address: req.user.email,
        name: { given_name: req.user.name || 'User' },
      },
      application_context: {
        brand_name: 'Africa JobBot',
        user_action: 'SUBSCRIBE_NOW',
        return_url: `${process.env.FRONTEND_URL}/subscription/success`,
        cancel_url: `${process.env.FRONTEND_URL}/pricing`,
      },
    }, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });

    // Store pending subscription
    const db = getDb();
    db.prepare(`
      INSERT INTO subscriptions (user_id, plan, billing_cycle, provider, status, paypal_subscription_id, paypal_plan_id, amount)
      VALUES (?, ?, ?, 'paypal', 'pending', ?, ?, ?)
    `).run(req.user.id, plan, billing_cycle, subscription.data.id, planId, PLAN_AMOUNTS[key] || 0);

    const approveLink = subscription.data.links.find(l => l.rel === 'approve');
    res.json({ subscription_id: subscription.data.id, approve_url: approveLink?.href });
  } catch (err) {
    console.error('PayPal create error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to create subscription' });
  }
});

// POST /api/subscription/verify — verify after PayPal redirect
router.post('/verify', auth, async (req, res) => {
  try {
    const { subscription_id } = req.body;
    const token = await getPayPalToken();

    const { data } = await axios.get(`${PAYPAL_BASE}/v1/billing/subscriptions/${subscription_id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (data.status === 'ACTIVE') {
      const db = getDb();
      const sub = db.prepare('SELECT * FROM subscriptions WHERE paypal_subscription_id = ? AND user_id = ?').get(subscription_id, req.user.id);
      if (!sub) return res.status(404).json({ error: 'Subscription record not found' });

      // Calculate end date
      const billingCycleMonths = { monthly: 1, '3mo': 3, '6mo': 6 }[sub.billing_cycle] || 1;
      const endDate = new Date();
      endDate.setMonth(endDate.getMonth() + billingCycleMonths);

      db.prepare(`
        UPDATE subscriptions SET status = 'active', start_date = datetime('now'), end_date = ?, updated_at = datetime('now')
        WHERE paypal_subscription_id = ?
      `).run(endDate.toISOString(), subscription_id);

      db.prepare("UPDATE users SET plan = ?, subscription_status = 'active', updated_at = datetime('now') WHERE id = ?")
        .run(sub.plan, req.user.id);

      return res.json({ status: 'active', plan: sub.plan });
    }

    res.json({ status: data.status });
  } catch (err) {
    console.error('PayPal verify error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Verification failed' });
  }
});

// POST /api/subscription/cancel
router.post('/cancel', auth, async (req, res) => {
  try {
    const db = getDb();
    const sub = db.prepare("SELECT * FROM subscriptions WHERE user_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1").get(req.user.id);
    if (!sub?.paypal_subscription_id) return res.status(404).json({ error: 'No active subscription found' });

    const token = await getPayPalToken();
    await axios.post(`${PAYPAL_BASE}/v1/billing/subscriptions/${sub.paypal_subscription_id}/cancel`,
      { reason: 'User requested cancellation' },
      { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
    );

    db.prepare("UPDATE subscriptions SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?").run(sub.id);
    db.prepare("UPDATE users SET subscription_status = 'cancelled', updated_at = datetime('now') WHERE id = ?").run(req.user.id);

    res.json({ message: 'Subscription cancelled. Access continues until period end.' });
  } catch (err) {
    console.error('PayPal cancel error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Cancellation failed' });
  }
});

// GET /api/subscription/status
router.get('/status', auth, (req, res) => {
  const db = getDb();
  const sub = db.prepare("SELECT * FROM subscriptions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1").get(req.user.id);
  const usage = db.prepare("SELECT * FROM usage_limits WHERE user_id = ? AND month = strftime('%Y-%m', 'now')").get(req.user.id);
  res.json({ subscription: sub || null, usage: usage || null, plan: req.user.plan });
});

module.exports = router;