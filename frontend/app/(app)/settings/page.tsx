'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Section = 'general' | 'retrieval' | 'sharing';

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="glass-card" style={{ padding: '22px 26px', marginBottom: '16px' }}>
      <h3 style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '16px', color: 'var(--text)' }}>{title}</h3>
      {children}
    </div>
  );
}

function SettingRow({ label, sub, children }: { label: string; sub?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
      <div>
        <div style={{ fontWeight: 500, fontSize: '0.875rem' }}>{label}</div>
        {sub && <div style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', marginTop: '2px' }}>{sub}</div>}
      </div>
      <div>{children}</div>
    </div>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const [activeSection, setActiveSection] = useState<Section>('general');

  const handleLogout = () => {
    localStorage.removeItem('kb_access_token');
    localStorage.removeItem('kb_refresh_token');
    router.push('/login');
  };

  return (
    <div className="fade-rise" style={{ maxWidth: '760px', margin: '0 auto', padding: '36px 24px' }}>
      <h1 style={{ fontSize: '1.4rem', fontWeight: 700, letterSpacing: '-0.02em', marginBottom: '6px' }}>Settings</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: '28px', fontSize: '0.875rem' }}>Manage preferences, retrieval configuration, and sharing.</p>

      {/* Section tabs */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '24px' }}>
        {(['general', 'retrieval', 'sharing'] as Section[]).map(s => (
          <button key={s} onClick={() => setActiveSection(s)}
            style={{ padding: '6px 16px', borderRadius: '99px', border: `1px solid ${activeSection === s ? 'var(--accent)' : 'var(--border)'}`, background: activeSection === s ? 'var(--accent-dim)' : 'transparent', color: activeSection === s ? 'var(--accent)' : 'var(--text-muted)', cursor: 'pointer', fontSize: '0.8rem', fontWeight: activeSection === s ? 600 : 400, transition: 'all 150ms', textTransform: 'capitalize' }}>
            {s}
          </button>
        ))}
      </div>

      {activeSection === 'general' && (
        <>
          <Card title="Account">
            <SettingRow label="Sign out" sub="Remove your session from this device">
              <button className="btn-ghost" style={{ fontSize: '0.8rem', borderColor: 'var(--error)', color: 'var(--error)' }} onClick={handleLogout}>Sign out</button>
            </SettingRow>
          </Card>

          <Card title="Appearance">
            <SettingRow label="Theme" sub="Executive dark is active">
              <span className="badge badge-green">Dark ✓</span>
            </SettingRow>
          </Card>

          <Card title="Data & Privacy">
            <SettingRow label="Memory extraction" sub="AI automatically extracts facts from conversations">
              <span className="badge badge-green">Active</span>
            </SettingRow>
            <SettingRow label="Chat history retention">
              <span className="badge">All time</span>
            </SettingRow>
          </Card>
        </>
      )}

      {activeSection === 'retrieval' && (
        <>
          <Card title="Retrieval Backend">
            <p style={{ fontSize: '0.83rem', color: 'var(--text-muted)', marginBottom: '14px', lineHeight: 1.6 }}>
              Configured via <code style={{ background: 'var(--surface-hover)', padding: '1px 6px', borderRadius: '4px', fontSize: '0.78rem' }}>RETRIEVAL_BACKEND</code> in your <code style={{ background: 'var(--surface-hover)', padding: '1px 6px', borderRadius: '4px', fontSize: '0.78rem' }}>.env</code> file.
            </p>
            {[
              { value: 'pgvector', label: 'pgvector', desc: 'PostgreSQL cosine similarity (default, no extra service)' },
              { value: 'qdrant', desc: 'Qdrant dense vector (requires Qdrant service)', label: 'Qdrant' },
              { value: 'hybrid', desc: 'pgvector + Qdrant + RRF fusion (best quality)', label: 'Hybrid ⭐' },
            ].map(opt => (
              <div key={opt.value} style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', background: 'var(--surface-hover)', marginBottom: '8px', border: '1px solid var(--border)' }}>
                <div style={{ fontWeight: 500, fontSize: '0.875rem' }}>{opt.label}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>{opt.desc}</div>
              </div>
            ))}
          </Card>

          <Card title="Embedding Backend">
            <SettingRow label="OpenAI text-embedding-3-small" sub="Default — configurable via EMBEDDING_BACKEND=openai">
              <span className="badge badge-green">Recommended</span>
            </SettingRow>
            <SettingRow label="fastembed (local)" sub="BAAI/bge-small-en-v1.5 · No API cost · Set EMBEDDING_BACKEND=fastembed">
              <span className="badge">Local</span>
            </SettingRow>
          </Card>

          <Card title="Ingestion">
            <SettingRow label="Audio transcription" sub="Whisper-1 via OpenAI API (mp3, mp4, m4a, wav, webm)">
              <span className="badge badge-green">Available</span>
            </SettingRow>
            <SettingRow label="Image OCR" sub="pytesseract — enabled in Docker">
              <span className="badge badge-green">Active</span>
            </SettingRow>
          </Card>
        </>
      )}

      {activeSection === 'sharing' && (
        <>
          <Card title="Collection Sharing">
            <p style={{ fontSize: '0.83rem', color: 'var(--text-muted)', marginBottom: '12px', lineHeight: 1.6 }}>
              Share any collection you own with other KnowBase users. Use the Library → collection menu to generate an invite link.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {[
                { role: 'Viewer', desc: 'Can search and chat over the collection', color: 'var(--accent)' },
                { role: 'Editor', desc: 'Can also add and delete documents', color: 'var(--warn)' },
                { role: 'Admin', desc: 'Can also invite and revoke other members', color: 'var(--error)' },
              ].map(({ role, desc, color }) => (
                <div key={role} style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', background: 'var(--surface-hover)', border: `1px solid var(--border)`, display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                  <span style={{ fontWeight: 600, fontSize: '0.8rem', color, minWidth: '52px' }}>{role}</span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{desc}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Shared with me">
            <p style={{ fontSize: '0.83rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
              Collections shared with you appear in your Library sidebar. Use <code style={{ background: 'var(--surface-hover)', padding: '1px 6px', borderRadius: '4px', fontSize: '0.78rem' }}>GET /api/v1/sharing/shared-with-me</code> to list them programmatically.
            </p>
          </Card>
        </>
      )}
    </div>
  );
}
