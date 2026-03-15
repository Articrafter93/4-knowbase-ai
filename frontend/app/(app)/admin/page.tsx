'use client';
import { useState, useEffect } from 'react';
import { admin as adminApi } from '../../../lib/api';

type Job = {
  id: string;
  document_id: string;
  status: string;
  progress: number;
  error_message?: string;
  created_at: string;
};

type Stats = {
  documents: { total: number; indexed: number };
  ingestion_jobs: { active: number };
};

export default function AdminPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'jobs' | 'prompts' | 'memory'>('jobs');

  useEffect(() => {
    async function load() {
      try {
        const [s, j] = await Promise.all([adminApi.getStats(), adminApi.getJobs()]);
        setStats(s);
        setJobs(j);
      } catch (e) {
        console.error('Failed to load admin stats', e);
      } finally {
        setLoading(false);
      }
    }
    load();
    const interval = setInterval(load, 10000); // Poll every 10s
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ padding: '28px', background: 'var(--bg)', minHeight: '100%' }}>
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '8px', letterSpacing: '-0.02em' }}>System Administration</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Monitor ingestion health, manage models and system prompts.</p>
      </div>

      {/* Quick Stats Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px', marginBottom: '40px' }}>
        <div className="glass-card" style={{ padding: '20px' }}>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', textTransform: 'uppercase', marginBottom: '4px' }}>Total Documents</p>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span style={{ fontSize: '1.75rem', fontWeight: 700 }}>{stats?.documents.total || 0}</span>
            <span style={{ fontSize: '0.85rem', color: 'var(--accent2)' }}>{stats?.documents.indexed || 0} indexed</span>
          </div>
        </div>
        <div className="glass-card" style={{ padding: '20px' }}>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', textTransform: 'uppercase', marginBottom: '4px' }}>Active Ingestion Jobs</p>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span style={{ fontSize: '1.75rem', fontWeight: 700, color: stats?.ingestion_jobs.active ? 'var(--warn)' : 'var(--text)' }}>
              {stats?.ingestion_jobs.active || 0}
            </span>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Workers: Online</span>
          </div>
        </div>
        <div className="glass-card" style={{ padding: '20px' }}>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', textTransform: 'uppercase', marginBottom: '4px' }}>System Latency (P95)</p>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span style={{ fontSize: '1.75rem', fontWeight: 700 }}>1.2s</span>
            <span style={{ fontSize: '0.85rem', color: 'var(--accent2)' }}>Stable</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '24px', borderBottom: '1px solid var(--border)', marginBottom: '24px' }}>
        {(['jobs', 'prompts', 'memory'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '12px 4px',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === tab ? '2px solid var(--accent)' : '2px solid transparent',
              color: activeTab === tab ? 'var(--text)' : 'var(--text-subtle)',
              fontWeight: activeTab === tab ? 600 : 400,
              cursor: 'pointer',
              fontSize: '0.9rem',
              textTransform: 'capitalize',
              transition: 'all 200ms'
            }}
          >
            {tab === 'jobs' ? 'Ingestion Jobs' : tab === 'prompts' ? 'System Prompts' : 'Memory Rules'}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="fade-rise">
        {activeTab === 'jobs' && (
          <div className="glass-card" style={{ overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
              <thead style={{ background: 'var(--surface)', color: 'var(--text-subtle)' }}>
                <tr>
                  <th style={{ padding: '12px 16px' }}>JOB ID</th>
                  <th style={{ padding: '12px 16px' }}>STATUS</th>
                  <th style={{ padding: '12px 16px' }}>PROGRESS</th>
                  <th style={{ padding: '12px 16px' }}>CREATED AT</th>
                </tr>
              </thead>
              <tbody>
                {jobs.length === 0 ? (
                  <tr><td colSpan={4} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-subtle)' }}>No recent jobs.</td></tr>
                ) : jobs.map(j => (
                  <tr key={j.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '12px 16px', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>{j.id.slice(0, 8)}...</td>
                    <td style={{ padding: '12px 16px' }}>
                      <span className={`badge ${j.status === 'completed' ? 'badge-green' : j.status === 'failed' ? 'badge-error' : 'badge-warn'}`}>
                        {j.status}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ flex: 1, height: '4px', background: 'var(--border)', borderRadius: '2px', overflow: 'hidden' }}>
                          <div style={{ width: `${j.progress}%`, height: '100%', background: 'var(--accent)', transition: 'width 300ms' }} />
                        </div>
                        <span style={{ fontSize: '0.7rem' }}>{j.progress}%</span>
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>
                      {new Date(j.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'prompts' && (
          <div style={{ display: 'grid', gap: '20px' }}>
            <div className="glass-card" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ fontWeight: 600 }}>RAG Assistant System Prompt</h3>
                <span className="badge">Production</span>
              </div>
              <textarea 
                readOnly
                defaultValue="You are a personal knowledge assistant. Use the following context to answer the user's questions. Always provide citations in [N] format. If the answer is not in the context, inform the user clearly."
                style={{ width: '100%', height: '120px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px', color: 'var(--text-muted)', fontSize: '0.8rem', resize: 'none' }}
              />
            </div>
            <div className="glass-card" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ fontWeight: 600 }}>Memory Extraction Rules</h3>
                <span className="badge">LangGraph</span>
              </div>
              <textarea 
                readOnly
                defaultValue="Identify and extract personal facts, preferences, or entities mentioned by the user that would be useful for future context. Store them in the user's personal memory namespace."
                style={{ width: '100%', height: '100px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px', color: 'var(--text-muted)', fontSize: '0.8rem', resize: 'none' }}
              />
            </div>
          </div>
        )}

        {activeTab === 'memory' && (
          <div className="glass-card" style={{ padding: '32px', textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', marginBottom: '16px' }}>🧠</div>
            <h3 style={{ fontWeight: 600, marginBottom: '8px' }}>Conversation Memory Patterns</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', maxWidth: '500px', margin: '0 auto' }}>
              Configure how the LangGraph orchestrator treats short-term vs long-term memory. 
              Currently using semantic search over the `memories` table with a similarity threshold of 0.81.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
