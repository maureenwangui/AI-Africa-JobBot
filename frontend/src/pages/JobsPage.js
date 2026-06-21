// src/pages/JobsPage.js
import React, { useEffect, useState } from 'react';
import { getMatchedJobs, submitApplication, generateCoverLetter } from '../api/client';

export default function JobsPage() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState({});
  const [msg, setMsg] = useState('');

  useEffect(() => {
    getMatchedJobs().then(r => setJobs(r.data)).catch(() => setJobs([])).finally(() => setLoading(false));
  }, []);

  const handleApply = async (job) => {
    setApplying(a => ({...a, [job.id]: true}));
    try {
      let cover_letter = '';
      try {
        const cl = await generateCoverLetter(job.id);
        cover_letter = cl.data.cover_letter;
      } catch {}
      await submitApplication({ job_id: job.id, cover_letter });
      setMsg(`✅ Applied to ${job.title} at ${job.company}`);
      setTimeout(() => setMsg(''), 4000);
    } catch (err) {
      setMsg(`❌ ${err.response?.data?.error || 'Application failed'}`);
      setTimeout(() => setMsg(''), 4000);
    } finally {
      setApplying(a => ({...a, [job.id]: false}));
    }
  };

  const scoreColor = (score) => score >= 80 ? '#00E676' : score >= 60 ? '#FFC107' : '#42A5F5';

  if (loading) return <div style={{ color: '#90CAF9', padding: '2rem' }}>Finding your best job matches...</div>;

  return (
    <div>
      {msg && <div style={{ background: msg.startsWith('✅') ? 'rgba(0,230,118,0.15)' : 'rgba(239,83,80,0.15)', border: `1px solid ${msg.startsWith('✅') ? '#00E67644' : '#EF535044'}`, color: msg.startsWith('✅') ? '#00E676' : '#EF5350', padding: '0.75rem 1rem', borderRadius: 10, marginBottom: '1rem', fontSize: '0.9rem' }}>{msg}</div>}
      <div style={{ color: '#90CAF9', fontSize: '0.85rem', marginBottom: '1rem' }}>{jobs.length} jobs matched to your profile</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {jobs.length === 0 && <div style={{ textAlign: 'center', color: '#64B5F6', padding: '3rem' }}>No matches yet. Upload your CV in Profile to start matching.</div>}
        {jobs.map(job => (
          <div key={job.id} style={{ background: 'rgba(13,71,161,0.2)', border: '1px solid rgba(66,165,245,0.15)', borderRadius: 14, padding: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, background: 'rgba(66,165,245,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#42A5F5', fontWeight: 700, fontSize: '1rem', flexShrink: 0 }}>
                {job.company?.[0] || 'J'}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ color: '#fff', fontWeight: 600, fontSize: '1rem', marginBottom: '0.2rem' }}>{job.title}</div>
                <div style={{ color: '#90CAF9', fontSize: '0.85rem' }}>{job.company} · {job.location || 'Kenya'} {job.remote ? '· Remote' : ''}</div>
                {job.salary && <div style={{ color: '#64B5F6', fontSize: '0.8rem', marginTop: '0.2rem' }}>💰 {job.salary}</div>}
                {job.description && <div style={{ color: '#90CAF9', fontSize: '0.82rem', marginTop: '0.5rem', lineHeight: 1.5 }}>{job.description?.slice(0, 150)}...</div>}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem', flexShrink: 0 }}>
                <div style={{ background: scoreColor(job.match_score) + '22', color: scoreColor(job.match_score), fontSize: '0.8rem', fontWeight: 700, padding: '0.3rem 0.75rem', borderRadius: 8 }}>
                  {Math.round(job.match_score)}% match
                </div>
                <button onClick={() => handleApply(job)} disabled={applying[job.id]}
                  style={{ background: '#1E88E5', color: '#fff', border: 'none', padding: '0.6rem 1.25rem', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, fontSize: '0.85rem', opacity: applying[job.id] ? 0.7 : 1 }}>
                  {applying[job.id] ? 'Applying...' : 'Apply Now'}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}