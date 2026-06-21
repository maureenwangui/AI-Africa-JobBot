// src/pages/ApplicationsPage.js
import React, { useEffect, useState } from 'react';
import { getApplications, updateApplicationStatus } from '../api/client';

const STATUSES = ['queued','sent','viewed','interview','rejected','hired'];
const STATUS_COLORS = { queued:'#90CAF9', sent:'#42A5F5', viewed:'#FFC107', interview:'#00E676', rejected:'#EF5350', hired:'#00E676' };

export default function ApplicationsPage() {
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    getApplications().then(r => setApps(r.data)).finally(() => setLoading(false));
  }, []);

  const filtered = filter === 'all' ? apps : apps.filter(a => a.status === filter);

  const handleStatus = async (id, status) => {
    await updateApplicationStatus(id, status);
    setApps(apps.map(a => a.id === id ? {...a, status} : a));
  };

  if (loading) return <div style={{ color: '#90CAF9', padding: '2rem' }}>Loading applications...</div>;

  return (
    <div>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
        {['all', ...STATUSES].map(s => (
          <button key={s} onClick={() => setFilter(s)}
            style={{ background: filter === s ? '#1565C0' : 'rgba(255,255,255,0.05)', color: filter === s ? '#fff' : '#90CAF9', border: '1px solid rgba(66,165,245,0.2)', padding: '0.4rem 0.9rem', borderRadius: 100, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.8rem', textTransform: 'capitalize' }}>
            {s} {s !== 'all' && <span style={{ color: STATUS_COLORS[s] }}>({apps.filter(a => a.status === s).length})</span>}
          </button>
        ))}
      </div>

      {filtered.length === 0 && <div style={{ color: '#64B5F6', textAlign: 'center', padding: '3rem' }}>No applications found. Upload your CV to start auto-applying!</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {filtered.map(app => (
          <div key={app.id} style={{ background: 'rgba(13,71,161,0.2)', border: '1px solid rgba(66,165,245,0.15)', borderRadius: 12, padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(66,165,245,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#42A5F5', fontWeight: 700, fontSize: '0.9rem', flexShrink: 0 }}>
              {app.company?.[0] || 'J'}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: '#fff', fontWeight: 600, fontSize: '0.95rem' }}>{app.job_title}</div>
              <div style={{ color: '#90CAF9', fontSize: '0.8rem' }}>{app.company} · {app.location || 'Kenya'}</div>
              <div style={{ color: '#64B5F6', fontSize: '0.75rem', marginTop: '0.2rem' }}>Applied {new Date(app.created_at).toLocaleDateString()}</div>
            </div>
            {app.match_score > 0 && <div style={{ background: 'rgba(0,230,118,0.1)', color: '#00E676', fontSize: '0.78rem', fontWeight: 600, padding: '0.25rem 0.6rem', borderRadius: 6 }}>{Math.round(app.match_score)}% match</div>}
            <select value={app.status} onChange={e => handleStatus(app.id, e.target.value)}
              style={{ background: STATUS_COLORS[app.status] + '22', color: STATUS_COLORS[app.status], border: `1px solid ${STATUS_COLORS[app.status]}44`, borderRadius: 8, padding: '0.35rem 0.75rem', fontFamily: 'inherit', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}>
              {STATUSES.map(s => <option key={s} value={s} style={{ background: '#041B3D', color: '#fff' }}>{s}</option>)}
            </select>
          </div>
        ))}
      </div>
    </div>
  );
}