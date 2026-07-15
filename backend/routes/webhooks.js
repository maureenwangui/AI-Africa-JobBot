// routes/webhooks.js — M-Pesa + Paystack Webhook Handlers
//
// Payment attempts live on the `Payment` model (checkoutRequestId /
// transactionRef, provider, status). The user's plan lives on the
// `Subscription` model (one row per user — userId is unique). A successful
// payment marks the Payment SUCCESS, then activates the linked Subscription.

const express = require('express');
const crypto  = require('crypto');
const prisma  = require('../confiq/prisma');

const router = express.Router();

// ─── Billing cycle → months map — matches the values sent by the frontend/
//     routes/subscription.js ('monthly' | '3mo' | '6mo') ────────────────────
const BILLING_MONTHS = { monthly: 1, '3mo': 3, '6mo': 6 };

// ─── activateSubscription ─────────────────────────────────────────────────────
// `sub` here is the linked Subscription row (payment.subscriptionId).
async function activateSubscription(sub) {
  const months  = BILLING_MONTHS[sub.billingCycle] || 1;
  const endDate = new Date();
  endDate.setMonth(endDate.getMonth() + months);

  // Wrapped in a transaction — both updates succeed or both fail
  await prisma.$transaction([
    prisma.subscription.update({
      where: { id: sub.id },
      data: {
        status:    'ACTIVE',
        startDate: new Date(),
        endDate,
      },
    }),
    prisma.user.update({
      where: { id: sub.userId },
      data: {
        plan:               sub.plan,
        subscriptionStatus: 'ACTIVE',
      },
    }),
  ]);

  console.log(`✅ Subscription activated: user ${sub.userId}, plan ${sub.plan}`);
}

// ══════════════════════════════════════════════════════════════════════════════
//  M-PESA STK PUSH CALLBACK
//  POST /api/webhooks/mpesa
// ══════════════════════════════════════════════════════════════════════════════
router.post('/mpesa', express.json(), (req, res) => {
  // Always respond 200 immediately — Safaricom requires this within 5 seconds
  res.json({ ResultCode: 0, ResultDesc: 'Accepted' });

  // Fire-and-forget async IIFE — response already sent, DB work runs after
  (async () => {
    try {
      const callback = req.body?.Body?.stkCallback;
      if (!callback) return;

      const { CheckoutRequestID, ResultCode, ResultDesc } = callback;
      console.log(`📱 M-Pesa callback: ${CheckoutRequestID} → ResultCode ${ResultCode}`);

      const payment = await prisma.payment.findFirst({
        where: { checkoutRequestId: CheckoutRequestID },
      });

      if (!payment) {
        return console.warn('⚠️ No payment found for CheckoutRequestID:', CheckoutRequestID);
      }

      if (ResultCode === 0) {
        // Payment successful
        const items    = callback.CallbackMetadata?.Item || [];
        const amount   = items.find(i => i.Name === 'Amount')?.Value;
        const mpesaRef = items.find(i => i.Name === 'MpesaReceiptNumber')?.Value;
        const phone    = items.find(i => i.Name === 'PhoneNumber')?.Value;

        await prisma.payment.update({
          where: { id: payment.id },
          data: {
            status:        'SUCCESS',
            receiptNumber: mpesaRef ? String(mpesaRef) : null,
            amount:        amount ? Number(amount) : payment.amount,
            paymentDate:   new Date(),
          },
        });

        if (payment.subscriptionId) {
          const sub = await prisma.subscription.findUnique({ where: { id: payment.subscriptionId } });
          if (sub) await activateSubscription(sub);
        }

        console.log(`💰 M-Pesa payment: KES ${amount} | Receipt: ${mpesaRef} | Phone: ${phone}`);

      } else {
        // Payment failed or cancelled
        await prisma.payment.update({
          where: { id: payment.id },
          data:  { status: 'FAILED' },
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

    // Fire-and-forget async IIFE — response already sent, DB work runs after
    (async () => {
      try {
        if (event === 'charge.success') {
          const reference = data.reference;

          const payment = await prisma.payment.findFirst({
            where: { transactionRef: reference },
          });

          if (!payment) {
            return console.warn('⚠️ No payment found for reference:', reference);
          }

          if (payment.status === 'SUCCESS') {
            return console.log('ℹ️ Payment already processed — skipping');
          }

          await prisma.payment.update({
            where: { id: payment.id },
            data: {
              status:      'SUCCESS',
              amount:      data.amount / 100,
              paymentDate: new Date(),
            },
          });

          if (payment.subscriptionId) {
            const sub = await prisma.subscription.findUnique({ where: { id: payment.subscriptionId } });
            if (sub && sub.status !== 'ACTIVE') await activateSubscription(sub);
          }

          console.log(`💰 Paystack payment: ${data.currency} ${data.amount / 100} from ${data.customer?.email}`);
        }

        if (event === 'subscription.disable' || event === 'subscription.expiry_card') {
          console.log(`⚠️ Paystack subscription issue: ${event}`);
        }

      } catch (err) {
        console.error('Paystack async webhook error:', err.message);
      }
    })();

  } catch (err) {
    console.error('Paystack webhook outer error:', err.message);
  }
});

module.exports = router;