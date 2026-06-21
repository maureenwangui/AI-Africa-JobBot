// src/pages/SubscriptionSuccessPage.js
import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { verifySubscription } from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function SubscriptionSuccessPage() {
  const [params] = useSearchParams();
  const [status, setStatus] = useState('verifying');
  const { refreshUser } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const subId = params.get('subscription_id');
    if (!subId) { setStatus('error'); return; }
    verifySubscription(subId)
      .then(async (res) => {
        if (res.data.status === 'active') {
          await refreshUser();
          setStatus('success');
          setTimeout(() => navigate('/dashboard'), 3000);
        } else setStatus('pending');
      })
      .catch(() => setStatus('error'));
  }, []);

  const content = {
    verifying: { icon: '⏳', title: 'Verifying your subscription...', sub: 'Please wait a moment.' },
    success:   { icon: '🎉', title: 'Subscription activated!', sub: 'Redirecting to your dashboard in 3 seconds...' },
    pending:   { icon: '⏸️', title: 'Payment pending', sub: 'PayPal is processing your payment. Check your email.' },
    error:     { icon: '❌', title: 'Verification failed', sub: 'Please contact support or try again.' },
  }[status];

  return (
    <div style={{ minHeight: '100vh', background: '#041B3D', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit' }}>
      <div style={{ background: 'rgba(13,71,161,0.3)', border: '1px solid rgba(66,165,245,0.2)', borderRadius: 18, padding: '3rem', textAlign: 'center', maxWidth: 440 }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>{content.icon}</div>
        <h2 style={{ color: '#fff', fontSize: '1.4rem', fontWeight: 700, marginBottom: '0.5rem' }}>{content.title}</h2>
        <p style={{ color: '#90CAF9', fontWeight: 300 }}>{content.sub}</p>
        {status !== 'verifying' && (
          <button onClick={() => navigate('/dashboard')} style={{ marginTop: '1.5rem', background: '#1E88E5', color: '#fff', border: 'none', borderRadius: 10, padding: '0.75rem 2rem', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>
            Go to Dashboard
          </button>
        )}
      </div>
    </div>
  );
}