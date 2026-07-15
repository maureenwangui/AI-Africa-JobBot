// routes/subscription.js
// Fixed: new PrismaClient() → shared singleton
// Fixed: Subscription.create uses camelCase Prisma fields
// Fixed: Subscription schema has no provider/amount/currency/checkoutRequestId/txRef
//        → these go in Payment model instead; Subscription only stores plan/status/billingCycle
// Fixed: prisma.usageLimit → prisma.usage
// Fixed: verify/cancel use camelCase and uppercase enum values
// Fixed: status 'active'/'pending'/'cancelled' → 'ACTIVE'/'PENDING'/'CANCELLED'
const express = require('express');
const axios   = require('axios');
const prisma  = require('../confiq/prisma');
const { auth } = require('../middleware/auth');

const router = express.Router();

const PLANS = {
  starter: { name: 'Starter', kes: 500,  applications: 20,  cv: 5,  cover_letters: 20  },
  growth:  { name: 'Growth',  kes: 1200, applications: 80,  cv: 20, cover_letters: 80  },
  pro:     { name: 'Pro',     kes: 2500, applications: 200, cv: 50, cover_letters: 200 },
};

const BILLING_MULTIPLIER = { monthly: 1, '3mo': 3, '6mo': 6 };

const DISCOUNTS = {
  monthly: { starter: 500,  growth: 1200, pro: 2500  },
  '3mo':   { starter: 1300, growth: 3000, pro: 6200  },
  '6mo':   { starter: 2400, growth: 5600, pro: 10600 },
};

// Plan name → Prisma SubscriptionPlan enum
const PLAN_ENUM = { starter: 'STARTER', growth: 'GROWTH', pro: 'PRO' };

function getPlanAmount(plan, billing_cycle) {
  return DISCOUNTS[billing_cycle]?.[plan] || null;
}

// GET /api/subscription/test-config
router.get('/test-config', (req, res) => {
  res.json({
    mpesa:    { configured: !!(process.env.MPESA_CONSUMER_KEY && process.env.MPESA_CONSUMER_SECRET), env: process.env.MPESA_ENV || 'sandbox' },
    paystack: { configured: !!process.env.PAYSTACK_SECRET_KEY, mode: process.env.PAYSTACK_SECRET_KEY?.startsWith('sk_live') ? 'LIVE' : 'TEST' },
    cloudinary: { configured: !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY) },
  });
});

// GET /api/subscription/plans
router.get('/plans', (req, res) => {
  res.json({ plans: PLANS, pricing: DISCOUNTS, currency: 'KES', payment_methods: ['mpesa', 'paystack'] });
});

// GET /api/subscription/status
router.get('/status', auth, async (req, res) => {
  try {
    const month = new Date().toISOString().slice(0, 7);
    const [sub, usage] = await Promise.all([
      // Fixed: userId camelCase, status uppercase
      prisma.subscription.findFirst({ where: { userId: req.user.id }, orderBy: { createdAt: 'desc' } }),
      // Fixed: prisma.usage not usageLimit, userId_month composite key
      prisma.usage.findUnique({ where: { userId_month: { userId: req.user.id, month } } }),
    ]);
    res.json({ subscription: sub || null, usage: usage || null, plan: req.user.plan });
  } catch (err) {
    console.error('Status error:', err.message);
    res.status(500).json({ error: 'Failed to fetch subscription status' });
  }
});

// ── M-PESA ────────────────────────────────────────────────────────────────────
async function getMpesaToken() {
  const key = process.env.MPESA_CONSUMER_KEY, secret = process.env.MPESA_CONSUMER_SECRET;
  if (!key || !secret) throw new Error('M-Pesa credentials not configured');
  const creds = Buffer.from(`${key}:${secret}`).toString('base64');
  const url   = process.env.MPESA_ENV === 'production'
    ? 'https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials'
    : 'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials';
  const { data } = await axios.get(url, { headers: { Authorization: `Basic ${creds}` } });
  return data.access_token;
}

// POST /api/subscription/mpesa/initiate
router.post('/mpesa/initiate', auth, async (req, res) => {
  try {
    const { plan, billing_cycle = 'monthly', phone } = req.body;
    if (!PLANS[plan])                       return res.status(400).json({ error: 'Invalid plan' });
    if (!BILLING_MULTIPLIER[billing_cycle]) return res.status(400).json({ error: 'Invalid billing cycle' });
    if (!phone)                             return res.status(400).json({ error: 'Phone required' });

    const amount = getPlanAmount(plan, billing_cycle);
    if (!amount) return res.status(400).json({ error: 'Could not calculate amount' });

    const formattedPhone = phone.replace(/^0/, '254').replace(/^\+/, '').replace(/\s/g, '');
    const token          = await getMpesaToken();
    const shortcode      = process.env.MPESA_SHORTCODE;
    const passkey        = process.env.MPESA_PASSKEY;
    const timestamp      = new Date().toISOString().replace(/[-T:.Z]/g, '').slice(0, 14);
    const password       = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');
    const callbackUrl    = `${process.env.BACKEND_URL}/api/webhooks/mpesa`;

    const mpesaUrl = process.env.MPESA_ENV === 'production'
      ? 'https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest'
      : 'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest';

    const { data } = await axios.post(mpesaUrl, {
      BusinessShortCode: shortcode, Password: password, Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline', Amount: amount,
      PartyA: formattedPhone, PartyB: shortcode, PhoneNumber: formattedPhone,
      CallBackURL: callbackUrl,
      AccountReference: `JOBBOT-${req.user.id}-${plan.toUpperCase()}`,
      TransactionDesc: `Africa JobBot ${PLANS[plan].name} Plan`,
    }, { headers: { Authorization: `Bearer ${token}` } });

    if (data.ResponseCode !== '0') return res.status(400).json({ error: data.ResponseDescription || 'M-Pesa request failed' });

    // Fixed: Subscription schema fields — only store what the schema has
    // Payment model stores the financial details
    const months  = BILLING_MULTIPLIER[billing_cycle];
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + months);

    await prisma.$transaction([
      prisma.subscription.upsert({
        where:  { userId: req.user.id },
        update: { plan: PLAN_ENUM[plan], status: 'PENDING', billingCycle: billing_cycle, applicationsLimit: PLANS[plan].applications, startDate: new Date(), endDate },
        create: { userId: req.user.id, plan: PLAN_ENUM[plan], status: 'PENDING', billingCycle: billing_cycle, applicationsLimit: PLANS[plan].applications, startDate: new Date(), endDate },
      }),
      prisma.payment.create({
        data: {
          userId:             req.user.id,
          provider:           'MPESA',
          status:             'PENDING',
          amount:             amount,
          currency:           'KES',
          plan:               PLAN_ENUM[plan],
          billingCycle:       billing_cycle.toUpperCase(),
          checkoutRequestId:  data.CheckoutRequestID,
          mpesaPhone:         formattedPhone,
        },
      }),
    ]);

    res.json({ message: 'STK Push sent. Enter your M-Pesa PIN.', checkout_request_id: data.CheckoutRequestID, amount, phone: formattedPhone });
  } catch (err) {
    console.error('M-Pesa error:', err.response?.data || err.message);
    if (err.message === 'M-Pesa credentials not configured') {
      return res.status(400).json({ error: 'M-Pesa not configured', code: 'MPESA_NOT_CONFIGURED' });
    }
    res.status(500).json({ error: 'M-Pesa payment failed. Please try again.' });
  }
});

// POST /api/subscription/mpesa/check
router.post('/mpesa/check', auth, async (req, res) => {
  try {
    const { checkout_request_id } = req.body;
    const payment = await prisma.payment.findFirst({
      where: { checkoutRequestId: checkout_request_id, userId: req.user.id },
    });
    if (!payment) return res.status(404).json({ error: 'Payment not found' });
    const sub = await prisma.subscription.findUnique({ where: { userId: req.user.id } });
    res.json({ status: payment.status.toLowerCase(), plan: sub?.plan?.toLowerCase() || req.user.plan });
  } catch (err) {
    res.status(500).json({ error: 'Status check failed' });
  }
});

// ── PAYSTACK ──────────────────────────────────────────────────────────────────
// POST /api/subscription/paystack/initiate
router.post('/paystack/initiate', auth, async (req, res) => {
  try {
    const { plan, billing_cycle = 'monthly', currency = 'KES' } = req.body;
    if (!PLANS[plan])                       return res.status(400).json({ error: 'Invalid plan' });
    if (!BILLING_MULTIPLIER[billing_cycle]) return res.status(400).json({ error: 'Invalid billing cycle' });

    const paystackKey = process.env.PAYSTACK_SECRET_KEY;
    if (!paystackKey) return res.status(400).json({ error: 'Paystack not configured', code: 'PAYSTACK_NOT_CONFIGURED' });

    const amount = getPlanAmount(plan, billing_cycle);
    if (!amount) return res.status(400).json({ error: 'Could not calculate amount' });

    const txRef = `JOBBOT-${req.user.id}-${plan}-${Date.now()}`;

    const { data } = await axios.post(
      'https://api.paystack.co/transaction/initialize',
      {
        email:        req.user.email,
        amount:       amount * 100,
        currency,
        reference:    txRef,
        callback_url: `${process.env.FRONTEND_URL}/payment-success.html`,
        metadata:     { user_id: req.user.id, plan, billing_cycle, name: req.user.name },
      },
      { headers: { Authorization: `Bearer ${paystackKey}`, 'Content-Type': 'application/json' } }
    );

    if (!data.status) return res.status(400).json({ error: data.message || 'Paystack request failed' });

    const months  = BILLING_MULTIPLIER[billing_cycle];
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + months);

    await prisma.$transaction([
      prisma.subscription.upsert({
        where:  { userId: req.user.id },
        update: { plan: PLAN_ENUM[plan], status: 'PENDING', billingCycle: billing_cycle, applicationsLimit: PLANS[plan].applications, startDate: new Date(), endDate },
        create: { userId: req.user.id, plan: PLAN_ENUM[plan], status: 'PENDING', billingCycle: billing_cycle, applicationsLimit: PLANS[plan].applications, startDate: new Date(), endDate },
      }),
      prisma.payment.create({
        data: {
          userId:           req.user.id,
          provider:         'PAYSTACK',
          status:           'PENDING',
          amount:           amount,
          currency,
          plan:             PLAN_ENUM[plan],
          billingCycle:     billing_cycle.toUpperCase(),
          paystackReference: txRef,
        },
      }),
    ]);

    res.json({ payment_url: data.data.authorization_url, access_code: data.data.access_code, reference: txRef, amount, currency });
  } catch (err) {
    console.error('Paystack error:', err.response?.data || err.message);
    res.status(500).json({ error: err.response?.data?.message || 'Payment initiation failed' });
  }
});

// POST /api/subscription/paystack/verify
router.post('/paystack/verify', auth, async (req, res) => {
  try {
    const { tx_ref, reference } = req.body;
    const ref = reference || tx_ref;
    if (!ref) return res.status(400).json({ error: 'reference required' });

    const { data } = await axios.get(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(ref)}`,
      { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` } }
    );

    const tx = data.data;
    if (!data.status || tx.status !== 'success') {
      return res.status(400).json({ error: 'Payment not successful', status: tx?.status });
    }

    const payment = await prisma.payment.findFirst({ where: { paystackReference: ref, userId: req.user.id } });
    if (!payment) return res.status(404).json({ error: 'Payment record not found' });
    if (payment.status === 'SUCCESS') return res.json({ status: 'active', plan: req.user.plan, message: 'Already activated' });

    await prisma.$transaction([
      prisma.payment.update({ where: { id: payment.id }, data: { status: 'SUCCESS', paystackTransactionId: String(tx.id) } }),
      prisma.subscription.update({ where: { userId: req.user.id }, data: { status: 'ACTIVE' } }),
      prisma.user.update({ where: { id: req.user.id }, data: { plan: payment.plan, subscriptionStatus: 'ACTIVE' } }),
    ]);

    res.json({ status: 'active', plan: payment.plan.toLowerCase(), message: `${PLANS[payment.plan.toLowerCase()]?.name || payment.plan} plan activated!` });
  } catch (err) {
    console.error('Paystack verify error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Verification failed' });
  }
});

// POST /api/subscription/cancel
router.post('/cancel', auth, async (req, res) => {
  try {
    const sub = await prisma.subscription.findUnique({ where: { userId: req.user.id } });
    if (!sub || sub.status !== 'ACTIVE') return res.status(404).json({ error: 'No active subscription found' });

    await prisma.$transaction([
      prisma.subscription.update({ where: { userId: req.user.id }, data: { status: 'CANCELLED' } }),
      prisma.user.update({ where: { id: req.user.id }, data: { subscriptionStatus: 'CANCELLED' } }),
    ]);

    res.json({ message: 'Subscription cancelled. Access continues until period end.' });
  } catch (err) {
    console.error('Cancel error:', err.message);
    res.status(500).json({ error: 'Cancellation failed' });
  }
});

module.exports = router;