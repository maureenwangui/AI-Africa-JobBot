// routes/subscription.js — M-Pesa + Paystack Payment Integration
//
// Data model note: `Subscription` (one row per user — userId is @unique)
// represents the user's current plan. `Payment` represents one individual
// transaction/attempt (provider, checkoutRequestId/transactionRef, status).
// Every "initiate" call below upserts the Subscription (so retrying a
// checkout never violates the unique userId constraint) and creates a new
// Payment row for that specific attempt.
const express = require('express');
const axios   = require('axios');
const { auth } = require('../middleware/auth');
const prisma  = require('../confiq/prisma');

const router = express.Router();

// ─── Plan Config ──────────────────────────────────────────────────────────────
// Public-facing plan slugs (used by the frontend & this API) map onto the
// Prisma SubscriptionPlan enum (FREE | STARTER | PROFESSIONAL | BUSINESS).
const PLANS = {
  starter: { name: 'Starter', usd: 4,  kes: 500,  applications: 20,  cv: 5,  cover_letters: 20  },
  growth:  { name: 'Growth',  usd: 9,  kes: 1200, applications: 80,  cv: 20, cover_letters: 80  },
  pro:     { name: 'Pro',     usd: 19, kes: 2500, applications: 200, cv: 50, cover_letters: 200 },
};

const PLAN_TO_ENUM = { starter: 'STARTER', growth: 'PROFESSIONAL', pro: 'BUSINESS' };

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

// Create/refresh the user's Subscription row as PENDING for the plan they're
// about to pay for. Safe to call repeatedly (upsert on the unique userId).
async function upsertPendingSubscription(userId, plan, billing_cycle) {
  return prisma.subscription.upsert({
    where:  { userId },
    update: {
      plan:              PLAN_TO_ENUM[plan],
      status:            'PENDING',
      billingCycle:      billing_cycle,
      applicationsLimit: PLANS[plan].applications,
    },
    create: {
      userId,
      plan:              PLAN_TO_ENUM[plan],
      status:            'PENDING',
      billingCycle:      billing_cycle,
      applicationsLimit: PLANS[plan].applications,
    },
  });
}

// ── GET /api/subscription/test-config ────────────────────────────────────────
router.get('/test-config', (req, res) => {
  res.json({
    mpesa: {
      configured: !!(process.env.MPESA_CONSUMER_KEY && process.env.MPESA_CONSUMER_SECRET),
      env:        process.env.MPESA_ENV || 'sandbox',
      shortcode:  process.env.MPESA_SHORTCODE || 'not set',
    },
    paystack: {
      configured:  !!process.env.PAYSTACK_SECRET_KEY,
      key_prefix:  process.env.PAYSTACK_SECRET_KEY
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
router.get('/status', auth, async (req, res) => {
  try {
    const month = new Date().toISOString().slice(0, 7);

    const [sub, usage] = await Promise.all([
      prisma.subscription.findUnique({
        where: { userId: req.user.id },
      }),
      prisma.usage.findFirst({
        where: { userId: req.user.id, month },
      }),
    ]);

    res.json({ subscription: sub || null, usage: usage || null, plan: req.user.plan });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch subscription status' });
  }
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

    if (!PLANS[plan])                       return res.status(400).json({ error: 'Invalid plan. Choose: starter, growth, or pro' });
    if (!BILLING_MULTIPLIER[billing_cycle]) return res.status(400).json({ error: 'Invalid billing cycle' });
    if (!phone)                             return res.status(400).json({ error: 'Phone number required for M-Pesa' });

    const amount = getPlanAmount(plan, billing_cycle, 'KES');
    if (!amount) return res.status(400).json({ error: 'Could not calculate amount' });

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

    const sub = await upsertPendingSubscription(req.user.id, plan, billing_cycle);

    await prisma.payment.create({
      data: {
        userId:            req.user.id,
        subscriptionId:    sub.id,
        provider:          'MPESA',
        status:            'PENDING',
        amount,
        currency:          'KES',
        checkoutRequestId: data.CheckoutRequestID,
        phoneNumber:       formattedPhone,
      },
    });

    res.json({
      message:             'STK Push sent to your phone. Enter your M-Pesa PIN to complete payment.',
      checkout_request_id: data.CheckoutRequestID,
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

    const payment = await prisma.payment.findFirst({
      where: { checkoutRequestId: checkout_request_id, userId: req.user.id },
    });

    if (!payment) return res.status(404).json({ error: 'Payment not found' });
    res.json({ status: payment.status, plan: req.user.plan });
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

    if (!PLANS[plan])                       return res.status(400).json({ error: 'Invalid plan. Choose: starter, growth, or pro' });
    if (!BILLING_MULTIPLIER[billing_cycle]) return res.status(400).json({ error: 'Invalid billing cycle' });

    const paystackKey = process.env.PAYSTACK_SECRET_KEY;
    if (!paystackKey) {
      return res.status(400).json({
        error: 'Paystack not configured. Add PAYSTACK_SECRET_KEY to .env',
        code:  'PAYSTACK_NOT_CONFIGURED',
      });
    }

    const amount = getPlanAmount(plan, billing_cycle, 'KES');
    if (!amount) return res.status(400).json({ error: 'Could not calculate amount' });

    const txRef    = `JOBBOT-${req.user.id}-${plan}-${Date.now()}`;
    const planInfo = PLANS[plan];

    const { data } = await axios.post(
      'https://api.paystack.co/transaction/initialize',
      {
        email:        req.user.email,
        amount:       amount * 100,
        currency,
        reference:    txRef,
        callback_url: `${process.env.FRONTEND_URL || 'http://localhost:5500'}/`,
        metadata: {
          user_id:       req.user.id,
          plan,
          billing_cycle,
          name:          req.user.name || req.user.email,
          custom_fields: [
            { display_name: 'Plan',          variable_name: 'plan',          value: planInfo.name  },
            { display_name: 'Billing Cycle', variable_name: 'billing_cycle', value: billing_cycle  },
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

    const sub = await upsertPendingSubscription(req.user.id, plan, billing_cycle);

    await prisma.payment.create({
      data: {
        userId:         req.user.id,
        subscriptionId: sub.id,
        provider:       'PAYSTACK',
        status:         'PENDING',
        amount,
        currency,
        transactionRef: txRef,
      },
    });

    res.json({
      payment_url: data.data.authorization_url,
      access_code: data.data.access_code,
      reference:   txRef,
      amount,
      currency,
    });
  } catch (err) {
    const errDetail = err.response?.data || err.message || err;
    console.error('Paystack initiate error FULL:', JSON.stringify(errDetail, null, 2));
    console.error('Paystack status:',  err.response?.status);
    console.error('Paystack headers:', err.response?.headers);

    const userMsg = err.response?.data?.message || err.message || 'Payment initiation failed';
    res.status(500).json({
      error:  userMsg,
      detail: process.env.NODE_ENV !== 'production' ? errDetail : undefined,
    });
  }
});

// POST /api/subscription/paystack/verify — verify after redirect
router.post('/paystack/verify', auth, async (req, res) => {
  try {
    const { tx_ref, reference } = req.body;
    const paystackKey = process.env.PAYSTACK_SECRET_KEY;

    const ref = reference || tx_ref;
    if (!ref) return res.status(400).json({ error: 'reference is required' });

    const { data } = await axios.get(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(ref)}`,
      { headers: { Authorization: `Bearer ${paystackKey}` } }
    );

    const tx = data.data;
    if (!data.status || tx.status !== 'success') {
      return res.status(400).json({ error: 'Payment not successful', status: tx?.status });
    }

    const payment = await prisma.payment.findFirst({
      where: { transactionRef: ref, userId: req.user.id },
    });
    if (!payment) return res.status(404).json({ error: 'Payment record not found' });

    // Prevent double activation
    if (payment.status === 'SUCCESS') {
      const existingSub = await prisma.subscription.findUnique({ where: { userId: req.user.id } });
      return res.json({ status: 'ACTIVE', plan: existingSub?.plan, message: 'Already activated' });
    }

    const sub = await prisma.subscription.findUnique({ where: { userId: req.user.id } });
    if (!sub) return res.status(404).json({ error: 'Subscription record not found' });

    const months  = BILLING_MULTIPLIER[sub.billingCycle] || 1;
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + months);

    // Atomic: mark the payment paid, activate the subscription, update the user
    await prisma.$transaction([
      prisma.payment.update({
        where: { id: payment.id },
        data:  { status: 'SUCCESS', paymentDate: new Date() },
      }),
      prisma.subscription.update({
        where: { id: sub.id },
        data: {
          status:    'ACTIVE',
          startDate: new Date(),
          endDate,
        },
      }),
      prisma.user.update({
        where: { id: req.user.id },
        data: {
          plan:               sub.plan,
          subscriptionStatus: 'ACTIVE',
        },
      }),
    ]);

    res.json({
      status:  'ACTIVE',
      plan:    sub.plan,
      message: `${sub.plan} plan activated!`,
    });
  } catch (err) {
    console.error('Paystack verify error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Verification failed' });
  }
});

// POST /api/subscription/cancel
router.post('/cancel', auth, async (req, res) => {
  try {
    const sub = await prisma.subscription.findUnique({
      where: { userId: req.user.id },
    });
    if (!sub || sub.status !== 'ACTIVE') {
      return res.status(404).json({ error: 'No active subscription found' });
    }

    // Atomic: cancel subscription + update user in one transaction
    await prisma.$transaction([
      prisma.subscription.update({
        where: { id: sub.id },
        data:  { status: 'CANCELLED' },
      }),
      prisma.user.update({
        where: { id: req.user.id },
        data:  { subscriptionStatus: 'CANCELLED' },
      }),
    ]);

    res.json({ message: 'Subscription cancelled. Access continues until period end.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Cancellation failed' });
  }
});

module.exports = router;