'use client';
import { useEffect, useState } from 'react';
import { admin } from '../../../lib/api';

type QueryStats = { period_days: number; total_queries: number; total_tokens: number; estimated_cost_usd: number; avg_latency_ms: number };
type TopDoc = { id: string; title: string; source_type: string; chunk_count: number; citation_count: number };
type Failure = { message_id: string; snippet: string; created_at: string };
type IndexHealth = { documents_by_status: Record<string, number>; chunks: { total: number; embedded: number }; embedding_coverage: number };

const SOURCE_ICONS: Record<string, string> = { pdf: '📄', docx: '📝', txt: '📃', markdown: '📋', url: '🔗', image: '🖼', audio: '🎵', note: '✏️' };

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="glass-card" style={{ padding: '20px 22px' }}>
      <div style={{ fontSize: '1.9rem', fontWeight: 700, letterSpacing: '-0.04em', color: color || 'var(--text)' }}>{value}</div>
      <div style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-muted)', marginTop: '4px' }}>{label}</div>
      {sub && <div style={{ fontSize: '0.72rem', color: 'var(--text-subtle)', marginTop: '2px' }}>{sub}</div>}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '28px 0 12px' }}>{children}</h2>;
}

export default function AnalyticsPage() {
  const [queryStats, setQueryStats] = useState<QueryStats | null>(null);
  const [topDocs, setTopDocs] = useState<TopDoc[]>([]);
  const [failures, setFailures] = useState<Failure[]>([]);
  const [health, setHealth] = useState<IndexHealth | null>(null);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    Promise.all([
      admin.getStats(),
      admin.getQueryAnalytics(days),
      admin.getTopDocuments(),
      admin.getRetrievalFailures(10),
      admin.getIndexHealth(),
    ])
      .then(([_stats, qs, docs, fails, h]) => {
        setQueryStats(qs);
        setTopDocs(Array.isArray(docs) ? docs : []);
        setFailures(Array.isArray(fails) ? fails : []);
        setHealth(h);
      })
      .catch(() => setError('Could not load analytics. Make sure you have admin or owner role.'))
      .finally(() => setLoading(false));
  }, [days]);

  if (error) return (
    <div style={{ padding: '60px', textAlign: 'center' }}>
      <div style={{ fontSize: '2rem', marginBottom: '12px' }}>⚠️</div>
      <p style={{ color: 'var(--error)' }}>{error}</p>
    </div>
  );

  return (
    <div className="fade-rise" style={{ maxWidth: '920px', margin: '0 auto', padding: '36px 28px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '6px' }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, letterSpacing: '-0.02em' }}>Analytics</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: '4px' }}>Usage, cost and retrieval quality</p>
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          {[7, 30, 90].map(d => (
            <button key={d} onClick={() => setDays(d)}
              style={{ padding: '5px 14px', borderRadius: '99px', border: `1px solid ${days === d ? 'var(--accent)' : 'var(--border)'}`, background: days === d ? 'var(--accent-dim)' : 'transparent', color: days === d ? 'var(--accent)' : 'var(--text-muted)', cursor: 'pointer', fontSize: '0.78rem', fontWeight: days === d ? 600 : 400, transition: 'all 150ms' }}>
              {d}d
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginTop: '24px' }}>
          {Array.from({ length: 8 }).map((_, i) => <div key={i} className="skeleton" style={{ height: '80px', borderRadius: 'var(--radius-md)' }} />)}
        </div>
      ) : (
        <>
          {/* Query stats */}
          <SectionTitle>Last {days} days</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '12px' }}>
            <StatCard label="Total Queries" value={queryStats?.total_queries ?? '—'} color="var(--accent)" />
            <StatCard label="Tokens Used" value={queryStats?.total_tokens?.toLocaleString() ?? '—'} />
            <StatCard label="Est. Cost" value={queryStats ? `$${queryStats.estimated_cost_usd}` : '—'} sub="gpt-4o blended rate" color="var(--warn)" />
            <StatCard label="Avg Latency" value={queryStats ? `${queryStats.avg_latency_ms}ms` : '—'} />
          </div>

          {/* Index health */}
          {health && (
            <>
              <SectionTitle>Index Health</SectionTitle>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '12px' }}>
                <StatCard label="Total Chunks" value={health.chunks.total.toLocaleString()} />
                <StatCard label="Embedded" value={health.chunks.embedded.toLocaleString()} color="var(--accent2)" />
                <StatCard label="Coverage" value={`${health.embedding_coverage}%`} color={health.embedding_coverage > 95 ? 'var(--accent2)' : 'var(--warn)'} />
                {Object.entries(health.documents_by_status).map(([status, count]) => (
                  <StatCard key={status} label={`Docs: ${status}`} value={count} color={status === 'indexed' ? 'var(--accent2)' : status === 'failed' ? 'var(--error)' : 'var(--warn)'} />
                ))}
              </div>
            </>
          )}

          {/* Top cited documents */}
          {topDocs.length > 0 && (
            <>
              <SectionTitle>Most Cited Documents</SectionTitle>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {topDocs.map((doc, i) => (
                  <div key={doc.id} className="glass-card" style={{ padding: '12px 18px', display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--accent)', minWidth: '20px' }}>#{i + 1}</span>
                    <span style={{ fontSize: '1.1rem' }}>{SOURCE_ICONS[doc.source_type] || '📄'}</span>
                    <span style={{ flex: 1, fontWeight: 500, fontSize: '0.875rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.title}</span>
                    <span className="badge badge-green" style={{ fontSize: '0.68rem', flexShrink: 0 }}>{doc.citation_count} citations</span>
                    <span className="badge" style={{ fontSize: '0.68rem', flexShrink: 0 }}>{doc.chunk_count} chunks</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Retrieval failures */}
          {failures.length > 0 && (
            <>
              <SectionTitle>Retrieval Failures</SectionTitle>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-subtle)', marginBottom: '10px' }}>Queries where the model reported insufficient source coverage</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {failures.map(f => (
                  <div key={f.message_id} className="glass-card" style={{ padding: '12px 18px', borderLeft: '3px solid var(--error)' }}>
                    <p style={{ fontSize: '0.83rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>{f.snippet}…</p>
                    <p style={{ fontSize: '0.7rem', color: 'var(--text-subtle)', marginTop: '6px' }}>{new Date(f.created_at).toLocaleString()}</p>
                  </div>
                ))}
              </div>
            </>
          )}

          {topDocs.length === 0 && failures.length === 0 && queryStats?.total_queries === 0 && (
            <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>📊</div>
              <h3 style={{ fontWeight: 600, marginBottom: '6px' }}>No usage data yet</h3>
              <p style={{ fontSize: '0.875rem' }}>Use the Chat to start generating analytics.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
