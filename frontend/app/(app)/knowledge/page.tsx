'use client';
import { useEffect, useState } from 'react';
import { library as libApi, admin as adminApi } from '../../../lib/api';

export default function KnowledgePage() {
  const [docs, setDocs] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      libApi.getDocuments(),
      adminApi.getStats().catch(() => null),
    ]).then(([d, s]) => { setDocs(d.slice(0, 8)); setStats(s); }).finally(() => setLoading(false));
  }, []);

  const statusColor: Record<string, string> = { indexed: 'var(--accent2)', processing: 'var(--warn)', failed: 'var(--error)', pending: 'var(--text-subtle)' };

  return (
    <div className="fade-rise" style={{ padding: '36px 36px' }}>
      <h1 style={{ fontSize: '1.4rem', fontWeight: 700, letterSpacing: '-0.02em', marginBottom: '6px' }}>Knowledge Panel</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: '36px', fontSize: '0.9rem' }}>Overview of your knowledge base health and activity.</p>

      {/* Stats */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '14px', marginBottom: '36px' }}>
          {[
            { label: 'Total Documents', value: stats.documents?.total ?? '—', color: 'var(--accent)' },
            { label: 'Indexed', value: stats.documents?.indexed ?? '—', color: 'var(--accent2)' },
            { label: 'Active Jobs', value: stats.ingestion_jobs?.active ?? 0, color: 'var(--warn)' },
          ].map(({ label, value, color }) => (
            <div key={label} className="glass-card" style={{ padding: '18px 20px' }}>
              <div style={{ fontSize: '1.8rem', fontWeight: 700, color, letterSpacing: '-0.03em' }}>{value}</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '4px', fontWeight: 500 }}>{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Recent documents */}
      <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '14px', color: 'var(--text-muted)' }}>Recent Documents</h2>
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {Array.from({length:5}).map((_,i) => <div key={i} className="skeleton" style={{ height: '52px', borderRadius: 'var(--radius-md)' }} />)}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {docs.map(doc => (
            <div key={doc.id} className="glass-card" style={{ padding: '12px 18px', display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: statusColor[doc.status] || 'var(--border)', flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 500, fontSize: '0.875rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.title}</div>
              </div>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
                {doc.chunk_count && <span className="badge badge-green" style={{ fontSize: '0.68rem' }}>{doc.chunk_count} chunks</span>}
                <span style={{ fontSize: '0.72rem', color: 'var(--text-subtle)' }}>{new Date(doc.created_at).toLocaleDateString()}</span>
              </div>
            </div>
          ))}
          {docs.length === 0 && <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '30px' }}>No documents yet. <a href="/upload" style={{ color: 'var(--accent)' }}>Add one</a>.</p>}
        </div>
      )}
    </div>
  );
}
