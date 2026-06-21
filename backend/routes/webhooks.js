// routes/webhooks.js — PayPal Webhook Handler
const express = require('express');
const axios = require('axios');
const getDb = require('../db/connection');

const router = express.Router();

const PAYPAL_BASE = process.env.PAYPAL_MODE === 'live'
  ? 'https://api-m.paypal.com'
  : 'https://api-m.sandbox.paypal.com';

async function verifyPayPalWebhook(req) {
  try {
    const token = await getPayPalToken();
    const { data } = await axios.post(`${PAYPAL_BASE}/v1/notifications/verify-webhook-signature`, {
      auth_algo: req.headers['paypal-auth-algo'],
      cert_url: req.headers['paypal-cert-url'],
      transmission_id: req.headers['paypal-transmission-id'],
      transmission_sig: req.headers['paypal-transmission-sig'],
      transmission_time: req.headers['paypal-transmission-time'],
      webhook_id: process.env.PAYPAL_WEBHOOK_ID,
      webhook_event: JSON.parse(req.body),
    }, { headers: { Authorization: `Bearer ${token}` } });
    return data.verification_status === 'SUCCESS';
  } catch { return false; }
}

async function getPayPalToken() {
  const res = await axios.post(`${PAYPAL_BASE}/v1/oauth2/token`,
    'grant_type=client_credentials',
    { auth: { username: process.env.PAYPAL_CLIENT_ID, password: process.env.PAYPAL_CLIENT_SECRET },
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  return res.data.access_token;
}

// POST /api/webhooks/paypal
router.post('/paypal', async (req, res) => {
  // Acknowledge immediately
  res.sendStatus(200);

  try {
    const valid = await verifyPayPalWebhook(req);
    if (!valid && process.env.NODE_ENV === 'production') {
      return console.warn('⚠️ PayPal webhook signature invalid — skipping');
    }

    const event = JSON.parse(req.body);
    const { event_type, resource } = event;
    const db = getDb();

    console.log(`📨 PayPal webhook: ${event_type}`);

    switch (event_type) {

      case 'BILLING.SUBSCRIPTION.ACTIVATED': {
        const subId = resource.id;
        const sub = db.prepare("SELECT * FROM subscriptions WHERE paypal_subscription_id = ?").get(subId);
        if (!sub) break;

        const billingCycleMonths = { monthly: 1, '3mo': 3, '6mo': 6 }[sub.billing_cycle] || 1;
        const endDate = new Date();
        endDate.setMonth(endDate.getMonth() + billingCycleMonths);

        db.prepare("UPDATE subscriptions SET status = 'active', start_date = datetime('now'), end_date = ?, updated_at = datetime('now') WHERE paypal_subscription_id = ?")
          .run(endDate.toISOString(), subId);
        db.prepare("UPDATE users SET subscription_status = 'active', plan = ?, updated_at = datetime('now') WHERE id = ?")
          .run(sub.plan, sub.user_id);

        console.log(`✅ Subscription activated: user ${sub.user_id}, plan ${sub.plan}`);
        break;
      }

      case 'BILLING.SUBSCRIPTION.CANCELLED':
      case 'BILLING.SUBSCRIPTION.EXPIRED': {
        const subId = resource.id;
        db.prepare("UPDATE subscriptions SET status = 'cancelled', updated_at = datetime('now') WHERE paypal_subscription_id = ?").run(subId);
        const sub = db.prepare("SELECT user_id FROM subscriptions WHERE paypal_subscription_id = ?").get(subId);
        if (sub) {
          db.prepare("UPDATE users SET subscription_status = 'inactive', plan = 'free', updated_at = datetime('now') WHERE id = ?").run(sub.user_id);
        }
        console.log(`❌ Subscription cancelled: ${subId}`);
        break;
      }

      case 'BILLING.SUBSCRIPTION.RENEWED': {
        const subId = resource.id;
        const sub = db.prepare("SELECT * FROM subscriptions WHERE paypal_subscription_id = ?").get(subId);
        if (!sub) break;

        const billingCycleMonths = { monthly: 1, '3mo': 3, '6mo': 6 }[sub.billing_cycle] || 1;
        const newEnd = new Date();
        newEnd.setMonth(newEnd.getMonth() + billingCycleMonths);

        db.prepare("UPDATE subscriptions SET end_date = ?, status = 'active', updated_at = datetime('now') WHERE paypal_subscription_id = ?")
          .run(newEnd.toISOString(), subId);
        console.log(`🔄 Subscription renewed: user ${sub.user_id}`);
        break;
      }

      case 'PAYMENT.SALE.COMPLETED': {
        console.log(`💰 Payment received: ${resource.amount?.total} ${resource.amount?.currency}`);
        break;
      }

      default:
        console.log(`Unhandled webhook event: ${event_type}`);
    }
  } catch (err) {
    console.error('Webhook processing error:', err.message);
  }
});

module.exports = router;