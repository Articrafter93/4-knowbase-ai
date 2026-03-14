'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';

const navItems = [
  { label: 'Library',       href: '/library',       icon: '⬡' },
  { label: 'Chat',          href: '/chat',           icon: '◈' },
  { label: 'Knowledge',     href: '/knowledge',      icon: '◉' },
  { label: 'Memory',        href: '/memory',         icon: '⬟' },
  { label: 'Smart Folders', href: '/smart-folders',  icon: '🔍' },
  { label: 'Analytics',     href: '/analytics',      icon: '◫' },
  { label: 'Upload',        href: '/upload',         icon: '+' },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);

  const handleLogout = () => {
    localStorage.removeItem('kb_access_token');
    localStorage.removeItem('kb_refresh_token');
    router.push('/login');
  };

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg)' }}>
      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside style={{
        width: collapsed ? '64px' : '240px',
        minWidth: collapsed ? '64px' : '240px',
        background: 'var(--surface)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        transition: 'width 240ms cubic-bezier(0.4,0,0.2,1), min-width 240ms cubic-bezier(0.4,0,0.2,1)',
        overflow: 'hidden',
        zIndex: 20,
      }}>
        {/* Logo area */}
        <div style={{
          padding: collapsed ? '20px 0' : '20px 20px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          cursor: 'pointer',
          justifyContent: collapsed ? 'center' : 'flex-start',
        }} onClick={() => setCollapsed(!collapsed)}>
          <div style={{
            width: '32px', height: '32px', minWidth: '32px',
            borderRadius: '9px', background: 'linear-gradient(135deg, #5B8CFF, #27D7A1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
            </svg>
          </div>
          {!collapsed && <span style={{ fontWeight: 700, fontSize: '1rem', letterSpacing: '-0.02em' }}>KnowBase</span>}
        </div>

        {/* Nav items */}
        <nav style={{ flex: 1, padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
          {navItems.map(({ label, href, icon }) => {
            const active = pathname?.startsWith(href);
            return (
              <Link key={href} href={href} id={`nav-${label.toLowerCase()}`} style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: collapsed ? '10px 0' : '9px 12px',
                borderRadius: 'var(--radius-md)',
                textDecoration: 'none',
                justifyContent: collapsed ? 'center' : 'flex-start',
                background: active ? 'var(--accent-dim)' : 'transparent',
                color: active ? 'var(--accent)' : 'var(--text-muted)',
                fontWeight: active ? 600 : 400,
                fontSize: '0.9rem',
                transition: 'background var(--transition), color var(--transition)',
              }}
              onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'var(--surface-hover)'; (e.currentTarget as HTMLElement).style.color = 'var(--text)'; }}
              onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; }}
              >
                <span style={{ fontSize: label === 'Upload' ? '1.2rem' : '1rem', lineHeight: 1 }}>{icon}</span>
                {!collapsed && <span>{label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Bottom actions */}
        <div style={{ padding: '12px 8px', borderTop: '1px solid var(--border)' }}>
          <Link href="/settings" style={{
            display: 'flex', alignItems: 'center', gap: '10px', justifyContent: collapsed ? 'center' : 'flex-start',
            padding: collapsed ? '10px 0' : '9px 12px', borderRadius: 'var(--radius-md)',
            textDecoration: 'none', color: 'var(--text-muted)', fontSize: '0.875rem',
          }}>
            <span>⚙</span>{!collapsed && <span>Settings</span>}
          </Link>
          <button onClick={handleLogout} style={{
            display: 'flex', alignItems: 'center', gap: '10px', justifyContent: collapsed ? 'center' : 'flex-start',
            padding: collapsed ? '10px 0' : '9px 12px', borderRadius: 'var(--radius-md)',
            width: '100%', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.875rem',
          }}>
            <span>→</span>{!collapsed && <span>Sign out</span>}
          </button>
        </div>
      </aside>

      {/* ── Main content ────────────────────────────────────────────────── */}
      <main style={{ flex: 1, overflow: 'auto', position: 'relative' }} className="fade-rise">
        {children}
      </main>
    </div>
  );
}
