// src/pages/DashboardPage.js
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getDashboard } from '../api/client';
import { useAuth } from '../context/AuthContext';

const STATUS_COLORS = {
  queued: '#90CAF9', sent: '#42A5F5', viewed: '#FFC107', interview: '#00E676', rejected: '#EF5350', hired: '#00E676',
};

export default function DashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDashboard().then(r => setData(r.data)).catch(console.error).finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={s.center}>Loading your dashboard...</div>;
  if (!data) return <div style={s.center}>Failed to load. Please refresh.</div>;

  const { stats, recent_applications, recent_jobs, usage } = data;
  const planLimit = usage?.limits?.applications || 3;
  const appsUsed = usage?.applications_used || 0;
  const usagePct = Math.min(100, Math.round((appsUsed / planLimit) * 100));

  return (
    <div>
      <div style={s.greeting}>Good morning, {user?.name?.split(' ')[0] || 'there'} 👋</div>
      <div style={s.sub}>Your AI agent is active and searching for opportunities across Kenya and Africa.</div>

      {/* Metrics */}
      <div style={s.metricsRow}>
        {[
          { label: 'Jobs Available', value: stats.total_jobs, sub: 'Active listings', icon: '💼' },
          { label: 'Applications Sent', value: stats.total_applications, sub: 'All time', icon: '📤' },
          { label: 'Sent This Month', value: stats.sent, sub: 'Auto-applied', icon: '🤖' },
          { label: 'Interviews', value: stats.interview, sub: 'Callback received', icon: '🎯' },
        ].map(m => (
          <div key={m.label} style={s.metricCard}>
            <div style={s.metricIcon}>{m.icon}</div>
            <div style={s.metricValue}>{m.value}</div>
            <div style={s.metricLabel}>{m.label}</div>
            <div style={s.metricSub}>{m.sub}</div>
          </div>
        ))}
      </div>

      {/* Usage bar */}
      <div style={s.usageCard}>
        <div style={s.usageRow}>
          <span style={s.usageLabel}>Monthly Usage — <span style={{ textTransform: 'capitalize', color: '#42A5F5' }}>{user?.plan}</span> Plan</span>
          <span style={{ fontSize: '0.82rem', color: '#90CAF9' }}>{appsUsed} / {planLimit} applications</span>
        </div>
        <div style={s.progressBg}><div style={{ ...s.progressFill, width: `${usagePct}%`, background: usagePct > 80 ? '#EF5350' : 'linear-gradient(90deg,#1E88E5,#42A5F5)' }} /></div>
        {usagePct > 80 && <div style={s.upgradeHint}>⚠️ Nearing limit — <Link to="/pricing" style={{ color: '#FFC107' }}>Upgrade your plan</Link></div>}
      </div>

      <div style={s.grid}>
        {/* Recent Matches */}
        <div style={s.card}>
          <div style={s.cardHeader}>
            <span style={s.cardTitle}>Recent Job Matches</span>
            <Link to="/jobs" style={s.cardLink}>View all →</Link>
          </div>
          {recent_jobs.length === 0 && <div style={s.empty}>No jobs yet. CV upload triggers matching.</div>}
          {recent_jobs.map(job => (
            <div key={job.id} style={s.jobRow}>
              <div style={s.jobAvatar}>{job.company?.[0] || 'J'}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={s.jobTitle}>{job.title}</div>
                <div style={s.jobCo}>{job.company} · {job.location || 'Kenya'}</div>
              </div>
              {job.remote === 1 && <span style={s.remoteBadge}>Remote</span>}
            </div>
          ))}
        </div>

        {/* Recent Applications */}
        <div style={s.card}>
          <div style={s.cardHeader}>
            <span style={s.cardTitle}>Application Tracker</span>
            <Link to="/applications" style={s.cardLink}>View all →</Link>
          </div>
          {recent_applications.length === 0 && <div style={s.empty}>No applications yet. We'll apply automatically once your CV is uploaded.</div>}
          {recent_applications.map(app => (
            <div key={app.id} style={s.jobRow}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={s.jobTitle}>{app.job_title}</div>
                <div style={s.jobCo}>{app.company} · {new Date(app.created_at).toLocaleDateString()}</div>
              </div>
              <span style={{ ...s.statusBadge, background: STATUS_COLORS[app.status] + '22', color: STATUS_COLORS[app.status] }}>{app.status}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const s = {
  greeting: { fontSize: '1.4rem', fontWeight: 700, color: '#fff', marginBottom: '0.25rem' },
  sub: { fontSize: '0.85rem', color: '#90CAF9', marginBottom: '1.5rem' },
  center: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: '#90CAF9' },
  metricsRow: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: '1rem', marginBottom: '1rem' },
  metricCard: { background: 'rgba(21,101,192,0.25)', border: '1px solid rgba(66,165,245,0.15)', borderRadius: 12, padding: '1.25rem' },
  metricIcon: { fontSize: '1.3rem', marginBottom: '0.5rem' },
  metricValue: { fontSize: '1.8rem', fontWeight: 800, color: '#fff' },
  metricLabel: { fontSize: '0.8rem', color: '#90CAF9', marginTop: '0.2rem', fontWeight: 500 },
  metricSub: { fontSize: '0.72rem', color: '#64B5F6', marginTop: '0.1rem' },
  usageCard: { background: 'rgba(21,101,192,0.2)', border: '1px solid rgba(66,165,245,0.15)', borderRadius: 12, padding: '1.25rem', marginBottom: '1rem' },
  usageRow: { display: 'flex', justifyContent: 'space-between', marginBottom: '0.6rem' },
  usageLabel: { fontSize: '0.8rem', color: '#90CAF9', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.5px' },
  progressBg: { background: 'rgba(255,255,255,0.1)', borderRadius: 100, height: 6, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 100, transition: 'width 0.6s ease' },
  upgradeHint: { fontSize: '0.78rem', color: '#EF5350', marginTop: '0.5rem' },
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' },
  card: { background: 'rgba(13,71,161,0.2)', border: '1px solid rgba(66,165,245,0.15)', borderRadius: 14, padding: '1.25rem' },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' },
  cardTitle: { fontSize: '0.78rem', fontWeight: 600, color: '#90CAF9', textTransform: 'uppercase', letterSpacing: '0.5px' },
  cardLink: { fontSize: '0.78rem', color: '#42A5F5', textDecoration: 'none' },
  jobRow: { display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.65rem 0', borderBottom: '1px solid rgba(255,255,255,0.05)' },
  jobAvatar: { width: 32, height: 32, borderRadius: 8, background: 'rgba(66,165,245,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#42A5F5', fontWeight: 700, fontSize: '0.78rem', flexShrink: 0 },
  jobTitle: { fontSize: '0.85rem', fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  jobCo: { fontSize: '0.75rem', color: '#90CAF9', fontWeight: 300 },
  remoteBadge: { fontSize: '0.68rem', background: 'rgba(0,230,118,0.15)', color: '#00E676', padding: '0.2rem 0.5rem', borderRadius: 5, fontWeight: 600 },
  statusBadge: { fontSize: '0.7rem', padding: '0.2rem 0.6rem', borderRadius: 6, fontWeight: 600, flexShrink: 0 },
  empty: { color: '#64B5F6', fontSize: '0.85rem', padding: '1rem 0', textAlign: 'center' },
};