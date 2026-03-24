'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

const navItems = [
  { label: 'Library',       href: '/library',       icon: '⬡' },
  { label: 'Chat',          href: '/chat',           icon: '◈' },
  { label: 'Analytics',     href: '/analytics',      icon: '◫' },
  { label: 'Knowledge',     href: '/knowledge',      icon: '◉' },
  { label: 'Memory',        href: '/memory',         icon: '⬟' },
  { label: 'Smart Folders', href: '/smart-folders',  icon: '🔍' },
  { label: 'Admin',         href: '/admin',          icon: '🛠' },
  { label: 'Upload',        href: '/upload',         icon: '+' },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [isCompact, setIsCompact] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('kb_access_token') : null;
    if (!token) {
      router.replace('/login');
      setAuthed(false);
    } else {
      setAuthed(true);
    }
  }, [router]);

  useEffect(() => {
    const syncViewport = () => {
      setIsCompact(window.innerWidth < 1180);
      setIsMobile(window.innerWidth < 900);
      if (window.innerWidth < 1180) {
        setCollapsed(true);
      }
    };

    syncViewport();
    window.addEventListener('resize', syncViewport);
    return () => window.removeEventListener('resize', syncViewport);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('kb_access_token');
    localStorage.removeItem('kb_refresh_token');
    router.push('/login');
  };

  if (!authed) return null;

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg)', flexDirection: isMobile ? 'column' : 'row' }}>
      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside style={{
        width: isMobile ? '100%' : collapsed ? '64px' : '240px',
        minWidth: isMobile ? '100%' : collapsed ? '64px' : '240px',
        background: 'var(--surface)',
        borderRight: isMobile ? 'none' : '1px solid var(--border)',
        borderBottom: isMobile ? '1px solid var(--border)' : 'none',
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
          justifyContent: isMobile ? 'space-between' : collapsed ? 'center' : 'flex-start',
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
          {(!collapsed || isMobile) && <span style={{ fontWeight: 700, fontSize: '1rem', letterSpacing: '-0.02em' }}>KnowBase</span>}
        </div>

        {/* Nav items */}
        <nav style={{ flex: 1, padding: '12px 8px', display: 'flex', flexDirection: isMobile ? 'row' : 'column', gap: '2px', overflowX: isMobile ? 'auto' : 'visible' }}>
          {navItems.map(({ label, href, icon }) => {
            const active = pathname?.startsWith(href);
            return (
              <Link key={href} href={href} id={`nav-${label.toLowerCase()}`} style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: collapsed ? '10px 0' : '9px 12px',
                borderRadius: 'var(--radius-md)',
                textDecoration: 'none',
                justifyContent: isMobile ? 'center' : collapsed ? 'center' : 'flex-start',
                background: active ? 'var(--accent-dim)' : 'transparent',
                color: active ? 'var(--accent)' : 'var(--text-muted)',
                fontWeight: active ? 600 : 400,
                fontSize: '0.9rem',
                transition: 'background var(--transition), color var(--transition)',
                minWidth: isMobile ? '120px' : undefined,
              }}
              onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'var(--surface-hover)'; (e.currentTarget as HTMLElement).style.color = 'var(--text)'; }}
              onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; }}
              >
                <span style={{ fontSize: label === 'Upload' ? '1.2rem' : '1rem', lineHeight: 1 }}>{icon}</span>
                {(!collapsed || isMobile) && <span>{label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Bottom actions */}
        <div style={{ padding: '12px 8px', borderTop: '1px solid var(--border)', display: isMobile ? 'none' : 'block' }}>
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
      <main style={{ flex: 1, overflow: 'auto', position: 'relative', borderRight: isMobile ? 'none' : '1px solid var(--border)' }} className="fade-rise">
        {children}
      </main>

      {/* ── Right Panel (Traceability & Context) ─────────────────────────── */}
      <aside style={{
        width: isCompact ? '280px' : '320px',
        minWidth: isCompact ? '280px' : '320px',
        background: 'var(--bg)',
        display: isMobile ? 'none' : 'flex',
        flexDirection: 'column',
        zIndex: 10,
        overflowY: 'auto',
      }}>
        <div style={{ padding: '20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-subtle)' }}>
            Context & Traceability
          </h2>
        </div>
        
        <div id="right-panel-content" style={{ padding: '20px' }}>
          {/* This well be populated via context or DOM portal by child pages */}
          <div style={{ textAlign: 'center', paddingTop: '60px', color: 'var(--text-subtle)' }}>
            <div style={{ fontSize: '2rem', marginBottom: '16px', opacity: 0.5 }}>🧭</div>
            <p style={{ fontSize: '0.8rem' }}>Select a result or citation to see technical details.</p>
          </div>
        </div>

        {/* System Health / Job monitor mini-view */}
        <div style={{ marginTop: 'auto', padding: '20px', borderTop: '1px solid var(--border)', background: 'var(--surface)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Ingestion Status</span>
            <span className="badge badge-green" style={{ fontSize: '0.65rem' }}>Active</span>
          </div>
          <div style={{ height: '4px', background: 'var(--border)', borderRadius: '2px', overflow: 'hidden' }}>
            <div style={{ width: '100%', height: '100%', background: 'var(--accent2)', opacity: 0.3 }} />
          </div>
        </div>
      </aside>
    </div>
  );
}
