// src/pages/RegisterPage.js
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { register, uploadCV } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { auth as s } from './LoginPage';

export default function RegisterPage() {
  const [form, setForm] = useState({ email: '', password: '', name: '', phone: '' });
  const [cvFile, setCvFile] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const res = await register(form);
      signIn(res.data.token, res.data.user);
      if (cvFile) {
        try { await uploadCV(cvFile); } catch {}
      }
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed');
    } finally { setLoading(false); }
  };

  const f = (field) => ({ value: form[field], onChange: e => setForm({...form, [field]: e.target.value}) });

  return (
    <div style={s.page}>
      <div style={{ ...s.card, maxWidth: 520 }}>
        <div style={s.logo}>Africa <span style={{ color: '#42A5F5' }}>JobBot</span></div>
        <h2 style={s.h2}>Create your account</h2>
        <p style={s.sub}>Start your free 7-day trial. No credit card required.</p>
        {error && <div style={s.error}>{error}</div>}
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div>
              <label style={s.label}>Full Name</label>
              <input style={s.input} placeholder="Maureen Wamwea" required {...f('name')} />
            </div>
            <div>
              <label style={s.label}>WhatsApp Phone</label>
              <input style={s.input} placeholder="+254 700 000 000" {...f('phone')} />
            </div>
          </div>
          <label style={s.label}>Email Address</label>
          <input style={s.input} type="email" placeholder="you@email.com" required {...f('email')} />
          <label style={s.label}>Password (min 8 characters)</label>
          <input style={s.input} type="password" placeholder="••••••••" required {...f('password')} />
          <label style={s.label}>Upload CV (PDF or DOCX)</label>
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '2px dashed rgba(66,165,245,0.3)', borderRadius: 10, padding: '1.25rem', textAlign: 'center', marginBottom: '1rem', cursor: 'pointer' }}
               onClick={() => document.getElementById('cv-input').click()}>
            <div style={{ fontSize: '2rem', marginBottom: '0.4rem' }}>📄</div>
            <div style={{ color: '#90CAF9', fontSize: '0.85rem' }}>{cvFile ? `✅ ${cvFile.name}` : 'Click to upload your CV'}</div>
            <input id="cv-input" type="file" accept=".pdf,.doc,.docx" style={{ display: 'none' }} onChange={e => setCvFile(e.target.files[0])} />
          </div>
          <button type="submit" style={s.btn} disabled={loading}>{loading ? 'Creating account...' : 'Create Account & Start Free Trial'}</button>
        </form>
        <p style={s.foot}>Already have an account? <Link to="/login" style={{ color: '#42A5F5' }}>Sign in</Link></p>
      </div>
    </div>
  );
}