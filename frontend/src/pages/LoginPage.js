// src/pages/LoginPage.js
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { login } from '../api/client';
import { useAuth } from '../context/AuthContext';

export function LoginPage() {
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const res = await login(form);
      signIn(res.data.token, res.data.user);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed');
    } finally { setLoading(false); }
  };

  return (
    <div style={auth.page}>
      <div style={auth.card}>
        <div style={auth.logo}>Africa <span style={{ color: '#42A5F5' }}>JobBot</span></div>
        <h2 style={auth.h2}>Welcome back</h2>
        <p style={auth.sub}>Log in to your AI job agent</p>
        {error && <div style={auth.error}>{error}</div>}
        <form onSubmit={handleSubmit}>
          <label style={auth.label}>Email</label>
          <input style={auth.input} type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} placeholder="you@email.com" required />
          <label style={auth.label}>Password</label>
          <input style={auth.input} type="password" value={form.password} onChange={e => setForm({...form, password: e.target.value})} placeholder="••••••••" required />
          <div style={{ textAlign: 'right', marginBottom: '1rem' }}>
            <Link to="/forgot-password" style={{ color: '#64B5F6', fontSize: '0.82rem' }}>Forgot password?</Link>
          </div>
          <button type="submit" style={auth.btn} disabled={loading}>{loading ? 'Signing in...' : 'Sign In'}</button>
        </form>
        <p style={auth.foot}>No account? <Link to="/register" style={{ color: '#42A5F5' }}>Register free</Link></p>
      </div>
    </div>
  );
}
export default LoginPage;

// ─── Auth styles ─────────────────────────────────────────────────────────────
export const auth = {
  page: { minHeight: '100vh', background: '#041B3D', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', fontFamily: "'DM Sans', Arial, sans-serif" },
  card: { background: 'rgba(13,71,161,0.25)', border: '1px solid rgba(66,165,245,0.2)', borderRadius: 18, padding: '2.5rem', width: '100%', maxWidth: 440 },
  logo: { fontWeight: 800, fontSize: '1.2rem', color: '#fff', marginBottom: '1.5rem' },
  h2: { color: '#fff', fontSize: '1.6rem', fontWeight: 700, margin: '0 0 0.3rem' },
  sub: { color: '#90CAF9', fontSize: '0.9rem', marginBottom: '1.5rem', fontWeight: 300 },
  label: { display: 'block', fontSize: '0.75rem', color: '#90CAF9', fontWeight: 500, marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.5px' },
  input: { width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(66,165,245,0.2)', borderRadius: 10, padding: '0.75rem 1rem', color: '#fff', fontSize: '0.9rem', outline: 'none', marginBottom: '1rem', boxSizing: 'border-box', fontFamily: 'inherit' },
  btn: { width: '100%', padding: '0.9rem', background: '#1E88E5', color: '#fff', border: 'none', borderRadius: 10, fontFamily: 'inherit', fontWeight: 600, fontSize: '1rem', cursor: 'pointer', marginTop: '0.25rem' },
  error: { background: 'rgba(239,83,80,0.15)', border: '1px solid rgba(239,83,80,0.3)', color: '#EF5350', padding: '0.6rem 0.75rem', borderRadius: 8, fontSize: '0.85rem', marginBottom: '1rem' },
  foot: { textAlign: 'center', color: '#90CAF9', fontSize: '0.85rem', marginTop: '1.25rem' },
};