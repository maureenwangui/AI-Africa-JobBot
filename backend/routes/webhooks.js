// routes/webhooks.js — M-Pesa + Paystack Webhook Handlers
const express = require('express');
const crypto  = require('crypto');
const { PrismaClient } = require('@prisma/client');

const router = express.Router();
const prisma = new PrismaClient();

const BILLING_MONTHS = { monthly: 1, '3mo': 3, '6mo': 6 };

// Now async — uses Prisma instead of better-sqlite3; wraps both updates in a
// transaction so they succeed or fail together
async function activateSubscription(prisma, sub) {
  const months  = BILLING_MONTHS[sub.billing_cycle] || 1;
  const endDate = new Date();
  endDate.setMonth(endDate.getMonth() + months);

  await prisma.$transaction([
    prisma.subscription.update({
      where: { id: sub.id },
      data: {
        status:     'active',
        start_date: new Date(),
        end_date:   endDate,
        updated_at: new Date(),
      },
    }),
    prisma.user.update({
      where: { id: sub.user_id },
      data: {
        plan:                sub.plan,
        subscription_status: 'active',
        updated_at:          new Date(),
      },
    }),
  ]);

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

  // Fire-and-forget async IIFE: response is already sent, DB work runs after
  (async () => {
    try {
      const callback = req.body?.Body?.stkCallback;
      if (!callback) return;

      const { CheckoutRequestID, ResultCode, ResultDesc } = callback;
      console.log(`📱 M-Pesa callback: ${CheckoutRequestID} → ResultCode ${ResultCode}`);

      const sub = await prisma.subscription.findFirst({
        where: { checkout_request_id: CheckoutRequestID },
      });
      if (!sub) return console.warn('⚠️ No subscription found for CheckoutRequestID:', CheckoutRequestID);

      if (ResultCode === 0) {
        // Payment successful — extract metadata
        const items    = callback.CallbackMetadata?.Item || [];
        const amount   = items.find(i => i.Name === 'Amount')?.Value;
        const mpesaRef = items.find(i => i.Name === 'MpesaReceiptNumber')?.Value;
        const phone    = items.find(i => i.Name === 'PhoneNumber')?.Value;

        await prisma.subscription.update({
          where: { id: sub.id },
          data: {
            mpesa_receipt: mpesaRef ?? null,
            amount_paid:   amount   ?? null,
            updated_at:    new Date(),
          },
        });

        await activateSubscription(prisma, sub);
        console.log(`💰 M-Pesa payment: KES ${amount} | Receipt: ${mpesaRef} | Phone: ${phone}`);
      } else {
        // Payment failed or cancelled by user
        await prisma.subscription.update({
          where: { id: sub.id },
          data:  { status: 'failed', updated_at: new Date() },
        });
        console.log(`❌ M-Pesa payment failed: ${ResultDesc}`);
      }
    } catch (err) {
      console.error('M-Pesa webhook processing error:', err.message);
    }
  })();
});

// ══════════════════════════════════════════════════════════════════════════════
//  PAYSTACK WEBHOOK
//  POST /api/webhooks/paystack
//  Paystack sends this after successful charge
//  Docs: https://paystack.com/docs/payments/webhooks/
// ══════════════════════════════════════════════════════════════════════════════
router.post('/paystack', express.json(), (req, res) => {
  try {
    // Verify webhook signature using HMAC SHA512 (synchronous — must happen before 200)
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

    // Fire-and-forget async IIFE: response is already sent, DB work runs after
    (async () => {
      try {
        if (event === 'charge.success') {
          const reference = data.reference;
          const sub = await prisma.subscription.findFirst({
            where: { tx_ref: reference },
          });

          if (!sub) {
            return console.warn('⚠️ No subscription found for reference:', reference);
          }
          if (sub.status === 'active') {
            return console.log('ℹ️ Subscription already active — skipping');
          }

          // Store Paystack transaction ID
          await prisma.subscription.update({
            where: { id: sub.id },
            data: {
              flw_transaction_id: String(data.id),
              amount_paid:        data.amount / 100,
              updated_at:         new Date(),
            },
          });

          await activateSubscription(prisma, sub);
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
    })();

  } catch (err) {
    console.error('Paystack webhook error:', err.message);
  }
});

module.exports = router;