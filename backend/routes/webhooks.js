// routes/webhooks.js — M-Pesa + Paystack Webhook Handlers
const express = require('express');
const crypto  = require('crypto');
const getDb   = require('../db/connection');

const router = express.Router();

const BILLING_MONTHS = { monthly: 1, '3mo': 3, '6mo': 6 };

function activateSubscription(db, sub) {
  const months  = BILLING_MONTHS[sub.billing_cycle] || 1;
  const endDate = new Date();
  endDate.setMonth(endDate.getMonth() + months);
  db.prepare(`
    UPDATE subscriptions
    SET status = 'active', start_date = datetime('now'), end_date = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(endDate.toISOString(), sub.id);
  db.prepare(`
    UPDATE users SET plan = ?, subscription_status = 'active', updated_at = datetime('now') WHERE id = ?
  `).run(sub.plan, sub.user_id);
  console.log(`✅ Subscription activated: user ${sub.user_id}, plan ${sub.plan}`);
}

// ══════════════════════════════════════════════════════════════════════════════
//  M-PESA STK PUSH CALLBACK
//  POST /api/webhooks/mpesa
//  Safaricom sends this after user enters PIN
// ══════════════════════════════════════════════════════════════════════════════
router.post('/mpesa', express.json(), (req, res) => {
  // Always respond 200 immediately — Safaricom requires this
  res.json({ ResultCode: 0, ResultDesc: 'Accepted' });

  try {
    const callback = req.body?.Body?.stkCallback;
    if (!callback) return;

    const { CheckoutRequestID, ResultCode, ResultDesc } = callback;
    console.log(`📱 M-Pesa callback: ${CheckoutRequestID} → ResultCode ${ResultCode}`);

    const db  = getDb();
    const sub = db.prepare("SELECT * FROM subscriptions WHERE checkout_request_id = ?").get(CheckoutRequestID);
    if (!sub) return console.warn('⚠️ No subscription found for CheckoutRequestID:', CheckoutRequestID);

    if (ResultCode === 0) {
      // Payment successful — extract metadata
      const items    = callback.CallbackMetadata?.Item || [];
      const amount   = items.find(i => i.Name === 'Amount')?.Value;
      const mpesaRef = items.find(i => i.Name === 'MpesaReceiptNumber')?.Value;
      const phone    = items.find(i => i.Name === 'PhoneNumber')?.Value;

      db.prepare(`
        UPDATE subscriptions
        SET mpesa_receipt = ?, amount_paid = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(mpesaRef || null, amount || null, sub.id);

      activateSubscription(db, sub);
      console.log(`💰 M-Pesa payment: KES ${amount} | Receipt: ${mpesaRef} | Phone: ${phone}`);
    } else {
      // Payment failed or cancelled by user
      db.prepare("UPDATE subscriptions SET status = 'failed', updated_at = datetime('now') WHERE id = ?").run(sub.id);
      console.log(`❌ M-Pesa payment failed: ${ResultDesc}`);
    }
  } catch (err) {
    console.error('M-Pesa webhook processing error:', err.message);
  }
});

// ══════════════════════════════════════════════════════════════════════════════
//  PAYSTACK WEBHOOK
//  POST /api/webhooks/paystack
//  Paystack sends this after successful charge
//  Docs: https://paystack.com/docs/payments/webhooks/
// ══════════════════════════════════════════════════════════════════════════════
router.post('/paystack', express.json(), (req, res) => {
  try {
    // Verify webhook signature using HMAC SHA512
    const secret    = process.env.PAYSTACK_SECRET_KEY;
    const signature = req.headers['x-paystack-signature'];

    if (secret && signature) {
      const hash = crypto
        .createHmac('sha512', secret)
        .update(JSON.stringify(req.body))
        .digest('hex');

      if (hash !== signature) {
        console.warn('⚠️ Invalid Paystack webhook signature — rejected');
        return res.status(401).json({ error: 'Invalid signature' });
      }
    }

    // Always respond 200 to Paystack immediately
    res.sendStatus(200);

    const { event, data } = req.body;
    console.log(`📨 Paystack webhook: ${event}`);

    const db = getDb();

    if (event === 'charge.success') {
      const reference = data.reference;
      const sub = db.prepare("SELECT * FROM subscriptions WHERE tx_ref = ?").get(reference);

      if (!sub) {
        return console.warn('⚠️ No subscription found for reference:', reference);
      }

      if (sub.status === 'active') {
        return console.log('ℹ️ Subscription already active — skipping');
      }

      // Store Paystack transaction ID
      db.prepare(`
        UPDATE subscriptions
        SET flw_transaction_id = ?, amount_paid = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(String(data.id), data.amount / 100, sub.id);

      activateSubscription(db, sub);
      console.log(`💰 Paystack payment: ${data.currency} ${data.amount / 100} from ${data.customer?.email}`);
    }

    if (event === 'subscription.disable' || event === 'subscription.expiry_card') {
      // Handle subscription issues
      console.log(`⚠️ Paystack subscription issue: ${event}`);
    }

  } catch (err) {
    console.error('Paystack webhook error:', err.message);
    // Don't send error response — Paystack already got 200
  }
});

module.exports = router;