// src/pages/ForgotPasswordPage.js
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { forgotPassword } from '../api/client';
import { auth as s } from './LoginPage';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    await forgotPassword(email).catch(() => {});
    setSent(true);
    setLoading(false);
  };

  return (
    <div style={s.page}>
      <div style={s.card}>
        <div style={s.logo}>Africa <span style={{ color: '#42A5F5' }}>JobBot</span></div>
        <h2 style={s.h2}>Reset password</h2>
        {sent ? (
          <>
            <div style={{ background: 'rgba(0,230,118,0.1)', border: '1px solid #00E67644', color: '#00E676', padding: '0.75rem', borderRadius: 8, marginBottom: '1rem', fontSize: '0.9rem' }}>
              ✅ If that email exists, a reset link has been sent.
            </div>
            <Link to="/login" style={{ ...s.btn, display: 'block', textAlign: 'center', textDecoration: 'none', background: 'rgba(66,165,245,0.1)', color: '#42A5F5' }}>Back to Login</Link>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <p style={s.sub}>Enter your email and we'll send a reset link.</p>
            <label style={s.label}>Email Address</label>
            <input style={s.input} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@email.com" required />
            <button type="submit" style={s.btn} disabled={loading}>{loading ? 'Sending...' : 'Send Reset Link'}</button>
            <p style={{ ...s.foot, marginTop: '1rem' }}><Link to="/login" style={{ color: '#42A5F5' }}>← Back to Login</Link></p>
          </form>
        )}
      </div>
    </div>
  );
}