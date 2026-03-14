'use client';
import { useEffect, useState, useCallback } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const auth = () => ({ Authorization: `Bearer ${localStorage.getItem('kb_access_token')}`, 'Content-Type': 'application/json' });

type SmartFolder = { id: string; name: string; description?: string; icon: string; query: string; filters?: Record<string, unknown>; top_k: number };
type SearchResult = { id: string; doc_title: string; fragment: string; score: number; source_type?: string; page_number?: number };

export default function SmartFoldersPage() {
  const [folders, setFolders] = useState<SmartFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newQuery, setNewQuery] = useState('');
  const [newIcon, setNewIcon] = useState('🔍');
  const [executing, setExecuting] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, SearchResult[]>>({});
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/api/v1/smart-folders/`, { headers: auth() })
      .then(r => r.json()).then(setFolders).finally(() => setLoading(false));
  }, []);

  const createFolder = useCallback(async () => {
    if (!newName.trim() || !newQuery.trim()) return;
    setCreating(true);
    const res = await fetch(`${API_BASE}/api/v1/smart-folders/`, {
      method: 'POST', headers: auth(),
      body: JSON.stringify({ name: newName.trim(), query: newQuery.trim(), icon: newIcon }),
    }).then(r => r.json());
    setFolders(prev => [{ id: res.id, name: newName, query: newQuery, icon: newIcon, top_k: 20 }, ...prev]);
    setNewName(''); setNewQuery('');
    setCreating(false);
  }, [newName, newQuery, newIcon]);

  const executeFolder = useCallback(async (f: SmartFolder) => {
    setExecuting(f.id);
    setExpanded(f.id);
    try {
      const data = await fetch(`${API_BASE}/api/v1/smart-folders/${f.id}/execute`, {
        method: 'POST', headers: auth(),
      }).then(r => r.json());
      setResults(prev => ({ ...prev, [f.id]: data.results || [] }));
    } finally { setExecuting(null); }
  }, []);

  const deleteFolder = async (id: string) => {
    await fetch(`${API_BASE}/api/v1/smart-folders/${id}`, { method: 'DELETE', headers: auth() });
    setFolders(prev => prev.filter(f => f.id !== id));
    setResults(prev => { const r = { ...prev }; delete r[id]; return r; });
  };

  const ICON_OPTIONS = ['🔍', '📌', '⭐', '🏷️', '🚀', '💡', '📚', '🔬', '🎯', '📅'];

  return (
    <div className="fade-rise" style={{ maxWidth: '820px', margin: '0 auto', padding: '36px 24px' }}>
      <h1 style={{ fontSize: '1.4rem', fontWeight: 700, letterSpacing: '-0.02em', marginBottom: '6px' }}>Smart Folders</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: '28px', fontSize: '0.875rem' }}>Saved searches that always show fresh results from your current knowledge base.</p>

      {/* Create new */}
      <div className="glass-card" style={{ padding: '22px 26px', marginBottom: '28px' }}>
        <h3 style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '14px' }}>Create smart folder</h3>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
          {ICON_OPTIONS.map(icon => (
            <button key={icon} onClick={() => setNewIcon(icon)}
              style={{ width: '36px', height: '36px', borderRadius: '8px', border: `1px solid ${newIcon === icon ? 'var(--accent)' : 'var(--border)'}`, background: newIcon === icon ? 'var(--accent-dim)' : 'transparent', cursor: 'pointer', fontSize: '1.1rem', transition: 'all 150ms' }}>
              {icon}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
          <input id="folder-name" className="input" style={{ flex: '0 0 200px' }} placeholder="Folder name" value={newName} onChange={e => setNewName(e.target.value)} />
          <input id="folder-query" className="input" placeholder="Search query (e.g. 'machine learning papers')" value={newQuery} onChange={e => setNewQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && createFolder()} />
          <button className="btn-primary" style={{ whiteSpace: 'nowrap' }} disabled={creating || !newName.trim() || !newQuery.trim()} onClick={createFolder}>
            {creating ? '…' : '+ Create'}
          </button>
        </div>
      </div>

      {/* Folder list */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton" style={{ height: '72px', borderRadius: 'var(--radius-md)' }} />)}
        </div>
      ) : folders.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>🔍</div>
          <h3 style={{ fontWeight: 600, marginBottom: '6px' }}>No smart folders yet</h3>
          <p style={{ fontSize: '0.875rem' }}>Create a saved search to quickly re-run important queries.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {folders.map(f => (
            <div key={f.id} className="glass-card" style={{ overflow: 'hidden' }}>
              <div style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '1.3rem' }}>{f.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '2px' }}>{f.name}</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-subtle)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.query}</div>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                  <button className="btn-primary" style={{ padding: '6px 14px', fontSize: '0.78rem' }}
                    disabled={executing === f.id} onClick={() => executeFolder(f)}>
                    {executing === f.id ? '…' : '▶ Run'}
                  </button>
                  <button onClick={() => setExpanded(expanded === f.id ? null : f.id)}
                    style={{ background: 'none', border: 'none', color: 'var(--text-subtle)', cursor: 'pointer', fontSize: '0.85rem', padding: '4px 8px' }}>
                    {expanded === f.id ? '▲' : '▼'}
                  </button>
                  <button onClick={() => deleteFolder(f.id)}
                    style={{ background: 'none', border: 'none', color: 'var(--error)', cursor: 'pointer', fontSize: '0.85rem', padding: '4px 8px', opacity: 0.7 }}>✕</button>
                </div>
              </div>

              {expanded === f.id && results[f.id] && (
                <div className="expand-enter" style={{ borderTop: '1px solid var(--border)', padding: '14px 20px' }}>
                  {results[f.id].length === 0 ? (
                    <p style={{ fontSize: '0.83rem', color: 'var(--text-subtle)', textAlign: 'center' }}>No results found.</p>
                  ) : (
                    results[f.id].map((r, i) => (
                      <div key={r.id} className="citation-highlight" style={{ marginBottom: '8px' }}>
                        <div style={{ display: 'flex', gap: '8px', marginBottom: '5px' }}>
                          <span style={{ color: 'var(--accent)', fontSize: '0.72rem', fontWeight: 600 }}>#{i + 1}</span>
                          <span style={{ fontWeight: 500, fontSize: '0.84rem' }}>{r.doc_title}</span>
                          {r.page_number && <span className="badge" style={{ fontSize: '0.66rem' }}>p.{r.page_number}</span>}
                          <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: 'var(--accent)', fontWeight: 600 }}>{(r.score * 100).toFixed(0)}%</span>
                        </div>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>{r.fragment}</p>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
