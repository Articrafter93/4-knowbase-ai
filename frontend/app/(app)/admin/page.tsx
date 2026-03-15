'use client';

import { useEffect, useState } from 'react';

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

type AdminConfig = {
  rag_prompt: string;
  memory_rule: string;
  retrieval_backend: string;
  top_k: number;
  rerank_top_k: number;
};

export default function AdminPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [config, setConfig] = useState<AdminConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'jobs' | 'prompts' | 'memory'>('jobs');

  useEffect(() => {
    async function load() {
      try {
        const [statsPayload, jobsPayload, configPayload] = await Promise.all([
          adminApi.getStats(),
          adminApi.getJobs(),
          adminApi.getConfig(),
        ]);
        setStats(statsPayload);
        setJobs(jobsPayload);
        setConfig(configPayload);
      } finally {
        setLoading(false);
      }
    }

    void load();
    const interval = setInterval(() => void load(), 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ padding: '28px', background: 'var(--bg)', minHeight: '100%' }}>
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '8px', letterSpacing: '-0.02em' }}>
          System Administration
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          Monitor ingestion health, retrieval settings and memory extraction rules.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px', marginBottom: '40px' }}>
        <div className="glass-card" style={{ padding: '20px' }}>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', textTransform: 'uppercase', marginBottom: '4px' }}>Total Documents</p>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span style={{ fontSize: '1.75rem', fontWeight: 700 }}>{stats?.documents.total || 0}</span>
            <span style={{ fontSize: '0.85rem', color: 'var(--accent2)' }}>{stats?.documents.indexed || 0} retrievable</span>
          </div>
        </div>
        <div className="glass-card" style={{ padding: '20px' }}>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', textTransform: 'uppercase', marginBottom: '4px' }}>Active Ingestion Jobs</p>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span style={{ fontSize: '1.75rem', fontWeight: 700, color: stats?.ingestion_jobs.active ? 'var(--warn)' : 'var(--text)' }}>
              {stats?.ingestion_jobs.active || 0}
            </span>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Workers online</span>
          </div>
        </div>
        <div className="glass-card" style={{ padding: '20px' }}>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', textTransform: 'uppercase', marginBottom: '4px' }}>Retrieval Backend</p>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--accent)' }}>{config?.retrieval_backend || 'hybrid'}</span>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>top-k {config?.top_k || 0}</span>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '24px', borderBottom: '1px solid var(--border)', marginBottom: '24px' }}>
        {(['jobs', 'prompts', 'memory'] as const).map((tab) => (
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
            }}
          >
            {tab === 'jobs' ? 'Ingestion jobs' : tab === 'prompts' ? 'Prompts' : 'Memory rules'}
          </button>
        ))}
      </div>

      {loading ? <div>Loading admin data...</div> : null}

      {!loading && activeTab === 'jobs' ? (
        <div className="glass-card" style={{ overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
            <thead style={{ background: 'var(--surface)', color: 'var(--text-subtle)' }}>
              <tr>
                <th style={{ padding: '12px 16px' }}>Job</th>
                <th style={{ padding: '12px 16px' }}>Status</th>
                <th style={{ padding: '12px 16px' }}>Progress</th>
                <th style={{ padding: '12px 16px' }}>Created</th>
              </tr>
            </thead>
            <tbody>
              {jobs.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-subtle)' }}>
                    No recent jobs.
                  </td>
                </tr>
              ) : (
                jobs.map((job) => (
                  <tr key={job.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '12px 16px', fontSize: '0.75rem' }}>{job.id.slice(0, 8)}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <span className={`badge ${job.status === 'completed' ? 'badge-green' : job.status === 'failed' ? 'badge-error' : 'badge-warn'}`}>
                        {job.status}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ flex: 1, height: '4px', background: 'var(--border)', borderRadius: '2px', overflow: 'hidden' }}>
                          <div style={{ width: `${job.progress}%`, height: '100%', background: 'var(--accent)', transition: 'width 300ms' }} />
                        </div>
                        <span style={{ fontSize: '0.7rem' }}>{job.progress}%</span>
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>{new Date(job.created_at).toLocaleString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : null}

      {!loading && activeTab === 'prompts' && config ? (
        <div style={{ display: 'grid', gap: '20px' }}>
          <div className="glass-card" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontWeight: 600 }}>RAG prompt</h3>
              <span className="badge">Live config</span>
            </div>
            <textarea
              readOnly
              value={config.rag_prompt}
              style={{ width: '100%', height: '120px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px', color: 'var(--text-muted)', fontSize: '0.8rem', resize: 'none' }}
            />
          </div>
          <div className="glass-card" style={{ padding: '20px' }}>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-subtle)', marginBottom: '6px' }}>Retrieval parameters</p>
            <p style={{ color: 'var(--text)' }}>Backend: {config.retrieval_backend}</p>
            <p style={{ color: 'var(--text)' }}>Top-k: {config.top_k}</p>
            <p style={{ color: 'var(--text)' }}>Rerank top-k: {config.rerank_top_k}</p>
          </div>
        </div>
      ) : null}

      {!loading && activeTab === 'memory' && config ? (
        <div className="glass-card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ fontWeight: 600 }}>Memory extraction rule</h3>
            <span className="badge">Namespace-aware</span>
          </div>
          <textarea
            readOnly
            value={config.memory_rule}
            style={{ width: '100%', height: '120px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px', color: 'var(--text-muted)', fontSize: '0.8rem', resize: 'none' }}
          />
        </div>
      ) : null}
    </div>
  );
}
