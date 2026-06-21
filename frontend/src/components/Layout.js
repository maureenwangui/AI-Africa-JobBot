// src/components/Layout.js
import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const NAV = [
  { path: '/dashboard',    icon: '📊', label: 'Dashboard'    },
  { path: '/jobs',         icon: '💼', label: 'Job Matches'  },
  { path: '/applications', icon: '📋', label: 'Applications' },
  { path: '/profile',      icon: '👤', label: 'My Profile'   },
  { path: '/pricing',      icon: '⚡', label: 'Upgrade Plan' },
];

const PLAN_COLORS = { free: '#90CAF9', starter: '#42A5F5', growth: '#FFC107', pro: '#00E676' };

export default function Layout({ children }) {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);

  const handleSignOut = () => { signOut(); navigate('/'); };

  return (
    <div style={s.wrap}>
      {/* Sidebar */}
      <aside style={{ ...s.sidebar, width: collapsed ? 64 : 220 }}>
        <div style={s.logoRow} onClick={() => setCollapsed(!collapsed)}>
          {!collapsed && <span style={s.logo}>Africa <span style={{ color: '#42A5F5' }}>JobBot</span></span>}
          {collapsed && <span style={{ fontSize: '1.4rem' }}>🤖</span>}
          <span style={{ cursor: 'pointer', color: '#90CAF9', fontSize: '0.8rem' }}>{collapsed ? '→' : '←'}</span>
        </div>

        <nav style={s.nav}>
          {NAV.map(item => {
            const active = location.pathname === item.path;
            return (
              <Link key={item.path} to={item.path} style={{ ...s.navItem, ...(active ? s.navActive : {}) }}>
                <span style={{ fontSize: '1.1rem' }}>{item.icon}</span>
                {!collapsed && <span style={s.navLabel}>{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        <div style={s.sidebarBottom}>
          {!collapsed && (
            <div style={s.planBadge}>
              <span style={{ fontSize: '0.7rem', color: '#90CAF9' }}>Current Plan</span>
              <span style={{ color: PLAN_COLORS[user?.plan] || '#42A5F5', fontWeight: 700, fontSize: '0.85rem', textTransform: 'uppercase' }}>
                {user?.plan || 'Free'}
              </span>
            </div>
          )}
          <button onClick={handleSignOut} style={s.signOutBtn}>
            <span>🚪</span>
            {!collapsed && <span>Sign Out</span>}
          </button>
        </div>
      </aside>

      {/* Main */}
      <main style={s.main}>
        <header style={s.header}>
          <div>
            <div style={s.headerTitle}>{NAV.find(n => n.path === location.pathname)?.label || 'Dashboard'}</div>
            <div style={s.headerSub}>AI agent is active and searching for jobs</div>
          </div>
          <div style={s.headerUser}>
            <div style={s.avatar}>{(user?.name || user?.email || 'U')[0].toUpperCase()}</div>
            {!collapsed && <span style={s.userName}>{user?.name || user?.email}</span>}
          </div>
        </header>
        <div style={s.content}>{children}</div>
      </main>
    </div>
  );
}

const s = {
  wrap: { display: 'flex', minHeight: '100vh', background: '#041B3D', fontFamily: "'DM Sans', Arial, sans-serif" },
  sidebar: { background: 'rgba(13,71,161,0.3)', borderRight: '1px solid rgba(66,165,245,0.15)', display: 'flex', flexDirection: 'column', transition: 'width 0.2s', flexShrink: 0 },
  logoRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem 1rem', borderBottom: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer' },
  logo: { fontWeight: 800, fontSize: '1rem', color: '#fff', letterSpacing: '-0.5px' },
  nav: { flex: 1, padding: '0.75rem 0' },
  navItem: { display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.7rem 1rem', color: '#90CAF9', textDecoration: 'none', borderRadius: 8, margin: '2px 8px', transition: 'all 0.15s' },
  navActive: { background: 'rgba(66,165,245,0.15)', color: '#fff', borderLeft: '2px solid #42A5F5' },
  navLabel: { fontSize: '0.88rem', fontWeight: 500 },
  sidebarBottom: { padding: '1rem', borderTop: '1px solid rgba(255,255,255,0.08)' },
  planBadge: { display: 'flex', flexDirection: 'column', background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: '0.6rem 0.75rem', marginBottom: '0.75rem' },
  signOutBtn: { display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'transparent', border: 'none', color: '#90CAF9', cursor: 'pointer', padding: '0.5rem', borderRadius: 6, fontSize: '0.85rem', width: '100%' },
  main: { flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.5rem', borderBottom: '1px solid rgba(255,255,255,0.08)', background: 'rgba(4,27,61,0.8)', backdropFilter: 'blur(8px)' },
  headerTitle: { fontSize: '1.1rem', fontWeight: 700, color: '#fff' },
  headerSub: { fontSize: '0.75rem', color: '#90CAF9', marginTop: 2 },
  headerUser: { display: 'flex', alignItems: 'center', gap: '0.75rem' },
  avatar: { width: 36, height: 36, borderRadius: '50%', background: '#1565C0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: '0.9rem' },
  userName: { fontSize: '0.85rem', color: '#90CAF9' },
  content: { flex: 1, padding: '1.5rem', overflowY: 'auto' },
};