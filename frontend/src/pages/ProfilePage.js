// src/pages/ProfilePage.js
import React, { useEffect, useState } from 'react';
import { getProfile, updateProfile, uploadCV } from '../api/client';

export default function ProfilePage() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState('');
  const [skills, setSkills] = useState('');
  const [roles, setRoles] = useState('');
  const [location, setLocation] = useState('');
  const [remote, setRemote] = useState(true);

  useEffect(() => {
    getProfile().then(r => {
      const p = r.data;
      setProfile(p);
      setSkills(Array.isArray(p.skills) ? p.skills.join(', ') : '');
      setRoles(Array.isArray(p.preferred_roles) ? p.preferred_roles.join(', ') : '');
      setLocation(p.preferred_location || 'Nairobi, Kenya');
      setRemote(p.remote_preference === 1);
    }).finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateProfile({
        skills: skills.split(',').map(s => s.trim()).filter(Boolean),
        preferred_roles: roles.split(',').map(s => s.trim()).filter(Boolean),
        preferred_location: location,
        remote_preference: remote,
        experience: profile.experience,
        education: profile.education,
        keywords: profile.keywords,
        summary: profile.summary,
      });
      setMsg('✅ Profile saved!');
    } catch { setMsg('❌ Save failed'); }
    finally { setSaving(false); setTimeout(() => setMsg(''), 3000); }
  };

  const handleCVUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const res = await uploadCV(file);
      const p = res.data;
      if (p.extracted?.skills) setSkills(p.extracted.skills.join(', '));
      if (p.extracted?.preferred_roles) setRoles(p.extracted.preferred_roles.join(', '));
      setMsg('✅ CV uploaded and parsed!');
    } catch { setMsg('❌ Upload failed'); }
    finally { setUploading(false); setTimeout(() => setMsg(''), 4000); }
  };

  if (loading) return <div style={{ color: '#90CAF9', padding: '2rem' }}>Loading profile...</div>;

  return (
    <div style={{ maxWidth: 700 }}>
      {msg && <div style={{ background: msg.startsWith('✅') ? 'rgba(0,230,118,0.15)' : 'rgba(239,83,80,0.15)', color: msg.startsWith('✅') ? '#00E676' : '#EF5350', border: '1px solid currentColor', borderRadius: 10, padding: '0.75rem 1rem', marginBottom: '1rem', fontSize: '0.9rem' }}>{msg}</div>}

      {/* CV Upload */}
      <div style={s.card}>
        <div style={s.cardTitle}>CV / Resume</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <div style={s.cvIcon}>📄</div>
          <div style={{ flex: 1 }}>
            <div style={{ color: '#fff', fontWeight: 600 }}>{profile?.cv_filename || 'No CV uploaded'}</div>
            <div style={{ color: '#90CAF9', fontSize: '0.8rem', marginTop: '0.2rem' }}>
              {profile?.cv_filename ? 'CV uploaded — AI has parsed your skills' : 'Upload your CV to start auto-matching and applying'}
            </div>
          </div>
          <label style={s.uploadBtn}>
            {uploading ? 'Uploading...' : profile?.cv_filename ? 'Re-upload CV' : 'Upload CV'}
            <input type="file" accept=".pdf,.doc,.docx" style={{ display: 'none' }} onChange={handleCVUpload} disabled={uploading} />
          </label>
        </div>
      </div>

      {/* Skills */}
      <div style={s.card}>
        <div style={s.cardTitle}>Skills & Preferences</div>
        <div style={s.formGroup}>
          <label style={s.label}>Skills (comma-separated)</label>
          <textarea style={s.textarea} value={skills} onChange={e => setSkills(e.target.value)} placeholder="Customer Service, Sales, Administration, Microsoft Office..." rows={3} />
        </div>
        <div style={s.formGroup}>
          <label style={s.label}>Preferred Job Roles</label>
          <input style={s.input} value={roles} onChange={e => setRoles(e.target.value)} placeholder="Executive Assistant, Sales Coordinator, Virtual Assistant..." />
        </div>
        <div style={s.formRow}>
          <div style={s.formGroup}>
            <label style={s.label}>Preferred Location</label>
            <input style={s.input} value={location} onChange={e => setLocation(e.target.value)} placeholder="Nairobi, Kenya" />
          </div>
          <div style={s.formGroup}>
            <label style={s.label}>Open to Remote?</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.5rem' }}>
              <div style={{ ...s.toggle, background: remote ? '#1E88E5' : 'rgba(255,255,255,0.1)' }} onClick={() => setRemote(!remote)}>
                <div style={{ ...s.toggleDot, transform: remote ? 'translateX(20px)' : 'translateX(2px)' }} />
              </div>
              <span style={{ color: remote ? '#42A5F5' : '#90CAF9', fontSize: '0.85rem' }}>{remote ? 'Yes — Remote OK' : 'No — On-site only'}</span>
            </div>
          </div>
        </div>
        <button style={s.saveBtn} onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save Profile'}</button>
      </div>

      {/* AI Summary */}
      {profile?.summary && (
        <div style={s.card}>
          <div style={s.cardTitle}>AI-Generated Summary</div>
          <p style={{ color: '#90CAF9', fontSize: '0.9rem', lineHeight: 1.7, fontWeight: 300 }}>{profile.summary}</p>
        </div>
      )}
    </div>
  );
}

const s = {
  card: { background: 'rgba(13,71,161,0.2)', border: '1px solid rgba(66,165,245,0.15)', borderRadius: 14, padding: '1.5rem', marginBottom: '1rem' },
  cardTitle: { fontSize: '0.78rem', fontWeight: 600, color: '#90CAF9', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '1rem' },
  cvIcon: { width: 48, height: 48, borderRadius: 10, background: 'rgba(66,165,245,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem' },
  uploadBtn: { background: 'rgba(30,136,229,0.2)', color: '#42A5F5', border: '1px solid rgba(66,165,245,0.3)', borderRadius: 8, padding: '0.55rem 1.25rem', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, fontFamily: 'inherit', whiteSpace: 'nowrap' },
  formGroup: { marginBottom: '1rem' },
  formRow: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' },
  label: { display: 'block', fontSize: '0.75rem', color: '#90CAF9', fontWeight: 500, marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.5px' },
  input: { width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(66,165,245,0.2)', borderRadius: 10, padding: '0.7rem 0.9rem', color: '#fff', fontSize: '0.88rem', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' },
  textarea: { width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(66,165,245,0.2)', borderRadius: 10, padding: '0.7rem 0.9rem', color: '#fff', fontSize: '0.88rem', outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' },
  saveBtn: { background: '#1E88E5', color: '#fff', border: 'none', borderRadius: 10, padding: '0.75rem 2rem', fontFamily: 'inherit', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer', marginTop: '0.5rem' },
  toggle: { width: 44, height: 24, borderRadius: 12, cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0 },
  toggleDot: { position: 'absolute', top: 2, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'transform 0.2s' },
};