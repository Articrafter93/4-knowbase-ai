'use client';
import { useEffect, useState, useCallback } from 'react';
import { memory as memApi } from '../../../lib/api';

type Memory = { id: string; content: string; memory_type: string; namespace: string; importance: number; tags?: string[]; updated_at: string; };

const TYPE_ICONS: Record<string, string> = { fact: '◈', preference: '⬟', project: '⬡', person: '◉', context: '◫' };

export default function MemoryPage() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [newContent, setNewContent] = useState('');
  const [newType, setNewType] = useState('fact');
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');

  useEffect(() => {
    memApi.list().then(setMemories).finally(() => setLoading(false));
  }, []);

  const addMemory = useCallback(async () => {
    if (!newContent.trim()) return;
    setAdding(true);
    const mem = await memApi.create(newContent.trim(), newType);
    setMemories(prev => [{ ...mem, memory_type: newType, namespace: 'general', importance: 5, updated_at: new Date().toISOString() }, ...prev]);
    setNewContent('');
    setAdding(false);
  }, [newContent, newType]);

  const deleteMemory = async (id: string) => {
    await memApi.remove(id);
    setMemories(prev => prev.filter(m => m.id !== id));
  };

  const saveEdit = async (id: string) => {
    await memApi.update(id, { content: editContent });
    setMemories(prev => prev.map(m => m.id === id ? { ...m, content: editContent } : m));
    setEditingId(null);
  };

  return (
    <div className="fade-rise" style={{ maxWidth: '820px', margin: '0 auto', padding: '40px 24px' }}>
      <h1 style={{ fontSize: '1.4rem', fontWeight: 700, letterSpacing: '-0.02em', marginBottom: '6px' }}>Personal Memory</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: '32px', fontSize: '0.9rem' }}>
        Facts, preferences, projects and context the AI uses across all conversations.
      </p>

      {/* Add new memory */}
      <div className="glass-card" style={{ padding: '22px 24px', marginBottom: '28px' }}>
        <h3 style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '14px' }}>Add a memory</h3>
        <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
          {['fact', 'preference', 'project', 'person', 'context'].map(t => (
            <button key={t} onClick={() => setNewType(t)}
              style={{ padding: '5px 12px', borderRadius: '99px', border: `1px solid ${newType === t ? 'var(--accent)' : 'var(--border)'}`, background: newType === t ? 'var(--accent-dim)' : 'transparent', color: newType === t ? 'var(--accent)' : 'var(--text-muted)', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 500, transition: 'all 150ms' }}>
              {TYPE_ICONS[t]} {t}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <input id="memory-input" className="input" placeholder={`Add a ${newType} the AI should remember…`}
            value={newContent} onChange={e => setNewContent(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addMemory()} />
          <button className="btn-primary" disabled={adding || !newContent.trim()} onClick={addMemory} style={{ whiteSpace: 'nowrap' }}>
            {adding ? '…' : 'Save'}
          </button>
        </div>
      </div>

      {/* Memory list */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {Array.from({length: 4}).map((_, i) => <div key={i} className="skeleton" style={{ height: '68px', borderRadius: 'var(--radius-md)' }} />)}
        </div>
      ) : memories.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>⬟</div>
          <h3 style={{ fontWeight: 600, marginBottom: '6px' }}>No memories yet</h3>
          <p style={{ fontSize: '0.875rem' }}>Add facts and preferences the AI should remember about you.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {memories.map(mem => (
            <div key={mem.id} className="glass-card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
              <span style={{ fontSize: '1.1rem', marginTop: '1px', color: 'var(--accent)', minWidth: '20px' }}>{TYPE_ICONS[mem.memory_type] || '◈'}</span>
              <div style={{ flex: 1 }}>
                {editingId === mem.id ? (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input className="input" style={{ padding: '6px 10px', fontSize: '0.85rem' }} value={editContent} onChange={e => setEditContent(e.target.value)} autoFocus />
                    <button className="btn-primary" style={{ padding: '6px 14px', fontSize: '0.8rem' }} onClick={() => saveEdit(mem.id)}>Save</button>
                    <button className="btn-ghost" style={{ padding: '5px 12px', fontSize: '0.8rem' }} onClick={() => setEditingId(null)}>Cancel</button>
                  </div>
                ) : (
                  <>
                    <p style={{ fontSize: '0.88rem', color: 'var(--text)', lineHeight: 1.5 }}>{mem.content}</p>
                    <div style={{ display: 'flex', gap: '6px', marginTop: '6px', alignItems: 'center' }}>
                      <span className="badge" style={{ fontSize: '0.68rem' }}>{mem.memory_type}</span>
                      <span className="badge" style={{ fontSize: '0.68rem' }}>{mem.namespace}</span>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-subtle)', marginLeft: '4px' }}>{new Date(mem.updated_at).toLocaleDateString()}</span>
                    </div>
                  </>
                )}
              </div>
              {editingId !== mem.id && (
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button onClick={() => { setEditingId(mem.id); setEditContent(mem.content); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-subtle)', fontSize: '0.85rem', padding: '4px 8px', borderRadius: 'var(--radius-sm)', transition: 'color 150ms' }}>✎</button>
                  <button onClick={() => deleteMemory(mem.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-subtle)', fontSize: '0.85rem', padding: '4px 8px', borderRadius: 'var(--radius-sm)', transition: 'color 150ms' }}>✕</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
