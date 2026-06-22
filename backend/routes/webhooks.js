// routes/webhooks.js — M-Pesa + Flutterwave Webhook Handlers
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
    UPDATE subscriptions SET status = 'active', start_date = datetime('now'), end_date = ?, updated_at = datetime('now') WHERE id = ?
  `).run(endDate.toISOString(), sub.id);
  db.prepare(`
    UPDATE users SET plan = ?, subscription_status = 'active', updated_at = datetime('now') WHERE id = ?
  `).run(sub.plan, sub.user_id);
  console.log(`✅ Subscription activated: user ${sub.user_id}, plan ${sub.plan}`);
}

// ══════════════════════════════════════════════════════════════════════════════
//  M-PESA STK PUSH CALLBACK
//  POST /api/webhooks/mpesa
// ══════════════════════════════════════════════════════════════════════════════
router.post('/mpesa', express.json(), (req, res) => {
  // Always respond 200 immediately to Safaricom
  res.json({ ResultCode: 0, ResultDesc: 'Accepted' });

  try {
    const callback = req.body?.Body?.stkCallback;
    if (!callback) return;

    const { CheckoutRequestID, ResultCode, ResultDesc } = callback;
    console.log(`📱 M-Pesa callback: ${CheckoutRequestID} → ResultCode ${ResultCode}`);

    const db  = getDb();
    const sub = db.prepare("SELECT * FROM subscriptions WHERE checkout_request_id = ?").get(CheckoutRequestID);
    if (!sub) return console.warn('⚠️ No subscription found for:', CheckoutRequestID);

    if (ResultCode === 0) {
      // Payment successful
      const items  = callback.CallbackMetadata?.Item || [];
      const amount = items.find(i => i.Name === 'Amount')?.Value;
      const mpesaRef = items.find(i => i.Name === 'MpesaReceiptNumber')?.Value;

      db.prepare(`
        UPDATE subscriptions SET mpesa_receipt = ?, amount_paid = ?, updated_at = datetime('now') WHERE id = ?
      `).run(mpesaRef, amount, sub.id);

      activateSubscription(db, sub);
      console.log(`💰 M-Pesa payment received: KES ${amount}, Receipt: ${mpesaRef}`);
    } else {
      // Payment failed or cancelled
      db.prepare("UPDATE subscriptions SET status = 'failed', updated_at = datetime('now') WHERE id = ?").run(sub.id);
      console.log(`❌ M-Pesa payment failed: ${ResultDesc}`);
    }
  } catch (err) {
    console.error('M-Pesa webhook error:', err.message);
  }
});

// ══════════════════════════════════════════════════════════════════════════════
//  FLUTTERWAVE WEBHOOK
//  POST /api/webhooks/flutterwave
// ══════════════════════════════════════════════════════════════════════════════
router.post('/flutterwave', express.json(), (req, res) => {
  // Verify webhook signature
  const hash      = req.headers['verif-hash'];
  const secretHash = process.env.FLUTTERWAVE_WEBHOOK_HASH;

  if (secretHash && hash !== secretHash) {
    console.warn('⚠️ Invalid Flutterwave webhook signature');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  res.sendStatus(200);

  try {
    const { event, data } = req.body;
    console.log(`📨 Flutterwave webhook: ${event}`);

    if (event === 'charge.completed' && data.status === 'successful') {
      const db  = getDb();
      const sub = db.prepare("SELECT * FROM subscriptions WHERE tx_ref = ?").get(data.tx_ref);
      if (!sub) return console.warn('⚠️ No subscription found for tx_ref:', data.tx_ref);

      if (sub.status === 'active') return; // Already activated

      db.prepare(`
        UPDATE subscriptions SET flw_transaction_id = ?, amount_paid = ?, updated_at = datetime('now') WHERE id = ?
      `).run(data.id, data.amount, sub.id);

      activateSubscription(db, sub);
      console.log(`💰 Flutterwave payment: ${data.currency} ${data.amount} from ${data.customer?.email}`);
    }
  } catch (err) {
    console.error('Flutterwave webhook error:', err.message);
  }
});

module.exports = router;