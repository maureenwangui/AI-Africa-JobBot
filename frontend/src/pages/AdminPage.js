// src/pages/AdminPage.js
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminGetStats, adminGetUsers, adminGetJobs, adminGetApplications } from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function AdminPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState('stats');
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [apps, setApps] = useState([]);

  useEffect(() => {
    if (user?.role !== 'admin') { navigate('/dashboard'); return; }
    adminGetStats().then(r => setStats(r.data));
    adminGetUsers().then(r => setUsers(r.data));
    adminGetJobs().then(r => setJobs(r.data));
    adminGetApplications().then(r => setApps(r.data));
  }, [user]);

  const PLAN_COLORS = { free: '#90CAF9', starter: '#42A5F5', growth: '#FFC107', pro: '#00E676' };

  return (
    <div style={{ minHeight: '100vh', background: '#041B3D', color: '#fff', fontFamily: 'inherit', padding: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700 }}>🛠️ Admin Panel</h1>
          <p style={{ color: '#90CAF9', fontSize: '0.82rem' }}>Africa JobBot system monitor</p>
        </div>
        <button onClick={() => navigate('/dashboard')} style={{ background: 'rgba(66,165,245,0.1)', color: '#42A5F5', border: '1px solid rgba(66,165,245,0.3)', borderRadius: 8, padding: '0.5rem 1rem', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.85rem' }}>← Dashboard</button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
        {['stats','users','jobs','applications'].map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ background: tab === t ? '#1565C0' : 'rgba(255,255,255,0.05)', color: tab === t ? '#fff' : '#90CAF9', border: '1px solid rgba(66,165,245,0.2)', borderRadius: 8, padding: '0.5rem 1.25rem', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.85rem', textTransform: 'capitalize' }}>{t}</button>
        ))}
      </div>

      {/* Stats */}
      {tab === 'stats' && stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: '1rem' }}>
          {[
            { label: 'Total Users', value: stats.total_users, icon: '👥' },
            { label: 'Active Subs', value: stats.active_subscribers, icon: '⚡' },
            { label: 'Applications', value: stats.total_applications, icon: '📋' },
            { label: 'Active Jobs', value: stats.total_jobs, icon: '💼' },
            { label: 'Est. MRR', value: `$${stats.revenue_est}`, icon: '💰' },
          ].map(s => (
            <div key={s.label} style={{ background: 'rgba(21,101,192,0.25)', border: '1px solid rgba(66,165,245,0.15)', borderRadius: 12, padding: '1.25rem' }}>
              <div style={{ fontSize: '1.4rem', marginBottom: '0.4rem' }}>{s.icon}</div>
              <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#fff' }}>{s.value}</div>
              <div style={{ fontSize: '0.78rem', color: '#90CAF9', marginTop: '0.2rem' }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Users */}
      {tab === 'users' && (
        <div style={t.table}>
          <div style={t.thead}>
            <span>Email</span><span>Name</span><span>Plan</span><span>Status</span><span>Joined</span>
          </div>
          {users.map(u => (
            <div key={u.id} style={t.row}>
              <span style={t.cell}>{u.email}</span>
              <span style={t.cell}>{u.name || '—'}</span>
              <span style={{ ...t.cell, color: PLAN_COLORS[u.plan] || '#fff', fontWeight: 600 }}>{u.plan}</span>
              <span style={t.cell}>{u.subscription_status}</span>
              <span style={t.cell}>{new Date(u.created_at).toLocaleDateString()}</span>
            </div>
          ))}
        </div>
      )}

      {/* Jobs */}
      {tab === 'jobs' && (
        <div style={t.table}>
          <div style={t.thead}><span>Title</span><span>Company</span><span>Location</span><span>Source</span></div>
          {jobs.map(j => (
            <div key={j.id} style={t.row}>
              <span style={t.cell}>{j.title}</span>
              <span style={t.cell}>{j.company}</span>
              <span style={t.cell}>{j.location || '—'}</span>
              <span style={t.cell}>{j.source || '—'}</span>
            </div>
          ))}
        </div>
      )}

      {/* Applications */}
      {tab === 'applications' && (
        <div style={t.table}>
          <div style={t.thead}><span>User</span><span>Job</span><span>Company</span><span>Status</span><span>Date</span></div>
          {apps.map(a => (
            <div key={a.id} style={t.row}>
              <span style={t.cell}>{a.email}</span>
              <span style={t.cell}>{a.job_title}</span>
              <span style={t.cell}>{a.company}</span>
              <span style={t.cell}>{a.status}</span>
              <span style={t.cell}>{new Date(a.created_at).toLocaleDateString()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const t = {
  table: { background: 'rgba(13,71,161,0.2)', border: '1px solid rgba(66,165,245,0.15)', borderRadius: 12, overflow: 'hidden' },
  thead: { display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', background: 'rgba(21,101,192,0.4)', padding: '0.75rem 1rem', fontSize: '0.72rem', color: '#90CAF9', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', gap: '1rem' },
  row: { display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', padding: '0.75rem 1rem', borderTop: '1px solid rgba(255,255,255,0.05)', gap: '1rem' },
  cell: { fontSize: '0.82rem', color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
};