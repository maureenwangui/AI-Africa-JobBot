// routes/webhooks.js — M-Pesa + Paystack Webhook Handlers
// Fixed: all field names now use Prisma camelCase (txRef, userId, billingCycle, startDate, endDate)
// Fixed: all enum values now use Prisma uppercase (ACTIVE, FAILED, FREE, STARTER, GROWTH, PRO)

const express = require('express');
const crypto  = require('crypto');
const prisma  = require('../confiq/prisma');

const router = express.Router();

// ─── Billing months map ───────────────────────────────────────────────────────
const BILLING_MONTHS = {
  MONTHLY:       1,
  THREE_MONTHS:  3,
  SIX_MONTHS:    6,
  ANNUAL:        12,
  // also handle lowercase strings from older records
  monthly:       1,
  '3mo':         3,
  '6mo':         6,
};

// ─── Plan map — normalize to Prisma uppercase enum ───────────────────────────
const normalizePlan = (plan) => {
  if (!plan) return 'FREE';
  const map = {
    free:         'FREE',
    starter:      'STARTER',
    growth:       'GROWTH',
    pro:          'PRO',
    FREE:         'FREE',
    STARTER:      'STARTER',
    GROWTH:       'GROWTH',
    PRO:          'PRO',
    PROFESSIONAL: 'PRO',
  };
  return map[plan] || 'FREE';
};

// ─── activateSubscription ─────────────────────────────────────────────────────
// Fixed field names:
//   sub.billing_cycle → sub.billingCycle
//   sub.user_id       → sub.userId
//   sub.plan          → normalized to Prisma uppercase
//   start_date        → startDate
//   end_date          → endDate
//   subscription_status → subscriptionStatus
//   updated_at        → updatedAt (handled by Prisma @updatedAt automatically)
// Fixed enum values:
//   'active' → 'ACTIVE'

async function activateSubscription(sub) {
  const months  = BILLING_MONTHS[sub.billingCycle] || 1;
  const endDate = new Date();
  endDate.setMonth(endDate.getMonth() + months);

  const planEnum = normalizePlan(sub.plan);

  // Wrapped in a transaction — both updates succeed or both fail
  await prisma.$transaction([

    // Fixed: status: 'active' → status: 'ACTIVE'
    // Fixed: start_date → startDate, end_date → endDate
    prisma.subscription.update({
      where: { id: sub.id },
      data: {
        status:    'ACTIVE',
        startDate: new Date(),
        endDate:   endDate,
      },
    }),

    // Fixed: sub.user_id → sub.userId
    // Fixed: subscription_status: 'active' → subscriptionStatus: 'ACTIVE'
    // Fixed: plan: sub.plan → plan: planEnum (uppercase Prisma enum)
    prisma.user.update({
      where: { id: sub.userId },
      data: {
        plan:               planEnum,
        subscriptionStatus: 'ACTIVE',
      },
    }),
  ]);

  console.log(`✅ Subscription activated: user ${sub.userId}, plan ${planEnum}`);
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

      // Fixed: checkout_request_id → checkoutRequestId (Prisma camelCase)
      const sub = await prisma.subscription.findFirst({
        where: { checkoutRequestId: CheckoutRequestID },
      });

      if (!sub) {
        return console.warn('⚠️ No subscription found for CheckoutRequestID:', CheckoutRequestID);
      }

      if (ResultCode === 0) {
        // Payment successful
        const items    = callback.CallbackMetadata?.Item || [];
        const amount   = items.find(i => i.Name === 'Amount')?.Value;
        const mpesaRef = items.find(i => i.Name === 'MpesaReceiptNumber')?.Value;
        const phone    = items.find(i => i.Name === 'PhoneNumber')?.Value;

        // Fixed: mpesa_receipt → mpesaReceipt, amount_paid → amountPaid
        await prisma.subscription.update({
          where: { id: sub.id },
          data: {
            mpesaReceipt: mpesaRef ?? null,
            amountPaid:   amount   ? Number(amount) : null,
          },
        });

        await activateSubscription(sub);
        console.log(`💰 M-Pesa payment: KES ${amount} | Receipt: ${mpesaRef} | Phone: ${phone}`);

      } else {
        // Payment failed or cancelled
        // Fixed: status: 'failed' → status: 'CANCELLED' (Prisma enum)
        await prisma.subscription.update({
          where: { id: sub.id },
          data:  { status: 'CANCELLED' },
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

          // Fixed: tx_ref → txRef (Prisma camelCase)
          const sub = await prisma.subscription.findFirst({
            where: { txRef: reference },
          });

          if (!sub) {
            return console.warn('⚠️ No subscription found for reference:', reference);
          }

          // Fixed: sub.status === 'active' → sub.status === 'ACTIVE'
          if (sub.status === 'ACTIVE') {
            return console.log('ℹ️ Subscription already active — skipping');
          }

          // Fixed: flw_transaction_id → paystackTransactionId
          // Fixed: amount_paid → amountPaid
          await prisma.subscription.update({
            where: { id: sub.id },
            data: {
              paystackTransactionId: String(data.id),
              amountPaid:            data.amount / 100,
            },
          });

          await activateSubscription(sub);
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