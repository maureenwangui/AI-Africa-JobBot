// src/pages/PricingPage.js
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createSubscription, verifySubscription } from '../api/client';
import { useAuth } from '../context/AuthContext';

const PLANS = {
  monthly: [
    { key: 'starter', name: 'Starter', price: 4, kes: 500, color: '#42A5F5', applications: 20, features: ['20 applications/month', 'Basic AI CV generator', '1 cover letter per job', 'Daily WhatsApp summary', 'Email notifications'] },
    { key: 'growth', name: 'Growth', price: 9, kes: 1200, color: '#FFC107', applications: 80, popular: true, features: ['80 applications/month', 'ATS CV optimization', 'Unlimited cover letters', 'AI job matching engine', 'WhatsApp + email alerts'] },
    { key: 'pro', name: 'Pro', price: 19, kes: 2500, color: '#00E676', applications: 200, features: ['200+ applications/month', 'Priority AI matching', 'Full auto-apply AI system', 'Interview tracking AI', '"Apply Until Hired" mode'] },
  ],
  '3mo': [
    { key: 'starter', name: 'Starter', price: 10, color: '#42A5F5', save: '17%', features: ['Same as Starter Monthly', 'Save 17% vs monthly'] },
    { key: 'growth',  name: 'Growth',  price: 24, color: '#FFC107', save: '11%', popular: true, features: ['Same as Growth Monthly', 'Save 11% vs monthly'] },
    { key: 'pro',     name: 'Pro',     price: 50, color: '#00E676', save: '12%', features: ['Same as Pro Monthly', 'Save 12% vs monthly'] },
  ],
  '6mo': [
    { key: 'starter', name: 'Starter', price: 18, color: '#42A5F5', save: '25%', features: ['Same as Starter Monthly', 'Save 25% vs monthly'] },
    { key: 'growth',  name: 'Growth',  price: 45, color: '#FFC107', save: '17%', popular: true, features: ['Same as Growth Monthly', 'Save 17% vs monthly'] },
    { key: 'pro',     name: 'Pro',     price: 85, color: '#00E676', save: '26%', features: ['Same as Pro Monthly', 'Save 26% vs monthly'] },
  ],
};

export default function PricingPage() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [billing, setBilling] = useState('monthly');
  const [loading, setLoading] = useState(null);
  const [error, setError] = useState('');

  const handleSubscribe = async (planKey) => {
    if (!user) return navigate('/register');
    setLoading(planKey);
    setError('');
    try {
      const res = await createSubscription(planKey, billing);
      if (res.data.approve_url) {
        window.location.href = res.data.approve_url;
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Subscription failed. Please try again.');
    } finally {
      setLoading(null);
    }
  };

  const plans = PLANS[billing];

  return (
    <div style={s.page}>
      <div style={s.nav}>
        <span style={s.logo}>Africa <span style={{ color: '#42A5F5' }}>JobBot</span></span>
        {user ? <button onClick={() => navigate('/dashboard')} style={s.navBtn}>Dashboard →</button>
               : <button onClick={() => navigate('/login')} style={s.navBtn}>Sign In</button>}
      </div>

      <div style={s.hero}>
        <div style={s.badge}>💳 Simple Pricing</div>
        <h1 style={s.h1}>Start Applying Today</h1>
        <p style={s.sub}>No hidden fees. Cancel anytime. 7-day free trial on all plans.</p>
      </div>

      {/* Billing toggle */}
      <div style={s.toggleRow}>
        {[['monthly', 'Monthly'], ['3mo', '3 Months'], ['6mo', '6 Months']].map(([val, label]) => (
          <button key={val} onClick={() => setBilling(val)} style={{ ...s.toggleBtn, ...(billing === val ? s.toggleActive : {}) }}>
            {label}
            {val !== 'monthly' && <span style={s.saveBadge}>{val === '3mo' ? 'Save 17%' : 'Save 25%'}</span>}
          </button>
        ))}
      </div>

      {error && <div style={s.error}>{error}</div>}

      <div style={s.grid}>
        {plans.map(plan => (
          <div key={plan.key} style={{ ...s.card, ...(plan.popular ? s.cardFeatured : {}), borderColor: plan.popular ? plan.color : 'rgba(66,165,245,0.2)' }}>
            {plan.popular && <div style={{ ...s.popularBadge, background: plan.color, color: plan.color === '#FFC107' ? '#000' : '#000' }}>⚡ Most Popular</div>}
            <div style={{ ...s.planName, color: plan.color }}>{plan.name.toUpperCase()}</div>
            <div style={s.price}><sup style={s.currency}>$</sup>{plan.price}</div>
            <div style={s.period}>{billing === 'monthly' ? 'per month' : `for ${billing === '3mo' ? '3' : '6'} months`}
              {plan.kes && <span style={s.kes}> · KES {plan.kes.toLocaleString()}</span>}
              {plan.save && <span style={{ color: '#00E676', marginLeft: 6 }}>Save {plan.save}</span>}
            </div>
            {plan.applications && <div style={s.appCount}>{plan.applications}+ applications/month</div>}
            <ul style={s.features}>
              {plan.features.map(f => <li key={f} style={s.feature}><span style={s.check}>✓</span>{f}</li>)}
            </ul>
            <button
              onClick={() => handleSubscribe(plan.key)}
              disabled={loading === plan.key}
              style={{ ...s.btn, background: plan.popular ? plan.color : 'transparent', color: plan.popular ? '#000' : plan.color, border: `1.5px solid ${plan.color}` }}
            >
              {loading === plan.key ? 'Redirecting to PayPal...' : user?.plan === plan.key ? '✓ Current Plan' : `Get ${plan.name}`}
            </button>
          </div>
        ))}
      </div>

      <div style={s.footer}>All plans include secure PayPal checkout · SSL encrypted · Cancel anytime · Based in Nairobi, Kenya 🇰🇪</div>
    </div>
  );
}

const s = {
  page: { minHeight: '100vh', background: '#041B3D', fontFamily: "'DM Sans', Arial, sans-serif", color: '#fff', padding: '0 1rem 3rem' },
  nav: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.25rem 1rem', borderBottom: '1px solid rgba(255,255,255,0.08)' },
  logo: { fontWeight: 800, fontSize: '1.2rem' },
  navBtn: { background: 'rgba(66,165,245,0.15)', color: '#42A5F5', border: '1px solid rgba(66,165,245,0.3)', padding: '0.5rem 1rem', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.85rem' },
  hero: { textAlign: 'center', padding: '3rem 1rem 1.5rem' },
  badge: { display: 'inline-block', background: 'rgba(66,165,245,0.15)', border: '1px solid rgba(66,165,245,0.3)', color: '#42A5F5', fontSize: '0.78rem', fontWeight: 600, padding: '0.3rem 1rem', borderRadius: 100, marginBottom: '1rem' },
  h1: { fontSize: 'clamp(1.8rem,4vw,2.8rem)', fontWeight: 800, margin: '0 0 0.75rem', letterSpacing: '-0.5px' },
  sub: { color: '#90CAF9', fontSize: '1rem', fontWeight: 300 },
  toggleRow: { display: 'flex', gap: '0.75rem', justifyContent: 'center', margin: '2rem 0', flexWrap: 'wrap' },
  toggleBtn: { background: 'transparent', color: '#90CAF9', border: '1px solid rgba(66,165,245,0.25)', padding: '0.5rem 1.25rem', borderRadius: 100, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem' },
  toggleActive: { background: '#1565C0', color: '#fff', border: '1px solid #1565C0' },
  saveBadge: { background: 'rgba(0,230,118,0.15)', color: '#00E676', fontSize: '0.7rem', padding: '0.15rem 0.4rem', borderRadius: 4, fontWeight: 600 },
  error: { background: 'rgba(239,83,80,0.15)', border: '1px solid rgba(239,83,80,0.3)', color: '#EF5350', padding: '0.75rem 1rem', borderRadius: 8, maxWidth: 700, margin: '0 auto 1rem', textAlign: 'center', fontSize: '0.85rem' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: '1.5rem', maxWidth: 900, margin: '0 auto' },
  card: { background: 'rgba(13,71,161,0.2)', border: '1.5px solid rgba(66,165,245,0.2)', borderRadius: 16, padding: '2rem', position: 'relative', transition: 'transform 0.2s' },
  cardFeatured: { background: 'rgba(21,101,192,0.35)' },
  popularBadge: { position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', fontSize: '0.7rem', fontWeight: 700, padding: '0.25rem 1rem', borderRadius: 100, whiteSpace: 'nowrap' },
  planName: { fontSize: '0.82rem', fontWeight: 700, letterSpacing: '1px', marginBottom: '0.75rem' },
  price: { fontSize: '2.4rem', fontWeight: 800, lineHeight: 1 },
  currency: { fontSize: '1rem', verticalAlign: 'super', fontWeight: 600 },
  period: { fontSize: '0.8rem', color: '#90CAF9', margin: '0.3rem 0 0.75rem' },
  kes: { color: '#64B5F6' },
  appCount: { background: 'rgba(66,165,245,0.1)', color: '#42A5F5', fontSize: '0.8rem', fontWeight: 600, padding: '0.3rem 0.75rem', borderRadius: 6, display: 'inline-block', marginBottom: '1rem' },
  features: { listStyle: 'none', padding: 0, margin: '0 0 1.5rem' },
  feature: { display: 'flex', gap: '0.6rem', alignItems: 'flex-start', padding: '0.45rem 0', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: '0.84rem', color: '#90CAF9', fontWeight: 300 },
  check: { color: '#00E676', fontWeight: 700, flexShrink: 0 },
  btn: { width: '100%', padding: '0.85rem', borderRadius: 10, fontFamily: 'inherit', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer', transition: 'all 0.2s' },
  footer: { textAlign: 'center', color: '#64B5F6', fontSize: '0.8rem', marginTop: '2.5rem', fontWeight: 300 },
};