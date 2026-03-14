'use client';
import { useEffect, useState, useRef, useCallback } from 'react';
import { library as libApi, search as searchApi } from '../../../lib/api';

type SearchResult = {
  chunk_id: string;
  document_id: string;
  doc_title: string;
  fragment: string;
  score: number;
  page_number?: number;
  section_title?: string;
  source_type?: string;
};

type Document = {
  id: string;
  title: string;
  source_type: string;
  status: string;
  is_favorite: boolean;
  chunk_count?: number;
  word_count?: number;
  created_at: string;
};

const SOURCE_ICONS: Record<string, string> = {
  pdf: '📄', docx: '📝', txt: '📃', markdown: '📋', url: '🔗', image: '🖼', audio: '🎵', note: '✏️',
};

function SkeletonCard() {
  return (
    <div className="glass-card" style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div className="skeleton" style={{ height: '14px', width: '60%' }} />
      <div className="skeleton" style={{ height: '11px', width: '40%' }} />
      <div className="skeleton" style={{ height: '11px', width: '80%' }} />
    </div>
  );
}

export default function LibraryPage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [collections, setCollections] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [selectedCollection, setSelectedCollection] = useState<string | undefined>();
  const [showFavorites, setShowFavorites] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'active' | 'archived' | 'trashed'>('active');
  const debounceRef = useRef<NodeJS.Timeout>(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      libApi.getDocuments(selectedCollection, statusFilter, showFavorites),
      libApi.getCollections(),
    ]).then(([docs, cols]) => {
      setDocuments(docs);
      setCollections(cols);
    }).finally(() => setLoading(false));
  }, [selectedCollection, statusFilter, showFavorites]);

  const handleSearch = useCallback((q: string) => {
    setSearchQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q.trim()) { setSearchResults(null); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await searchApi.query(q, selectedCollection);
        setSearchResults(res.results);
      } finally { setSearching(false); }
    }, 400);
  }, [selectedCollection]);

  const updateDocStatus = async (id: string, newStatus: string) => {
    if (newStatus === 'deleted') {
      // Hard delete
      await libApi.deleteDocument(id);
      setDocuments(docs => docs.filter(d => d.id !== id));
    } else {
      await libApi.updateDocumentStatus(id, newStatus);
      if (newStatus !== statusFilter) {
        setDocuments(docs => docs.filter(d => d.id !== id));
      } else {
        setDocuments(docs => docs.map(d => d.id === id ? { ...d, status: newStatus } : d));
      }
    }
  };

  const filteredDocs = documents; // Now server-filtered via useEffect dependencies

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ padding: '24px 32px 0', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '4px', letterSpacing: '-0.02em' }}>Library</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>{documents.length} documents in your knowledge base</p>
          </div>
          <a href="/upload" className="btn-primary">+ Add document</a>
        </div>

        {/* Search bar */}
        <div style={{ position: 'relative', marginBottom: '20px' }}>
          <span style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-subtle)', fontSize: '0.9rem' }}>🔍</span>
          <input
            id="library-search"
            className="input"
            style={{ paddingLeft: '38px' }}
            placeholder="Search your knowledge base…"
            value={searchQuery}
            onChange={e => handleSearch(e.target.value)}
          />
          {searching && <span style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-subtle)', fontSize: '0.75rem' }}>Retrieving…</span>}
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginBottom: '16px' }}>
          <div style={{ display: 'flex', gap: '4px', background: 'rgba(255,255,255,0.05)', padding: '4px', borderRadius: '8px' }}>
            {['active', 'archived', 'trashed'].map((s) => (
              <button
                key={s}
                className={`btn-ghost ${statusFilter === s ? 'active' : ''}`}
                style={{ fontSize: '0.75rem', padding: '4px 12px', textTransform: 'capitalize' }}
                onClick={() => setStatusFilter(s as any)}
              >
                {s === 'active' ? 'Files' : s}
              </button>
            ))}
          </div>
          
          <div style={{ width: '1px', height: '20px', background: 'var(--border)' }} />

          <div style={{ display: 'flex', gap: '8px', overflowX: 'auto' }}>
            <button className={`btn-ghost${!selectedCollection && !showFavorites ? ' active' : ''}`}
              onClick={() => { setSelectedCollection(undefined); setShowFavorites(false); }} style={{ whiteSpace: 'nowrap', fontSize: '0.8rem' }}>
              All
            </button>
            {collections.map(c => (
              <button key={c.id} className="btn-ghost" onClick={() => setSelectedCollection(c.id)}
                style={{ whiteSpace: 'nowrap', fontSize: '0.8rem', borderColor: selectedCollection === c.id ? 'var(--accent)' : 'var(--border)', color: selectedCollection === c.id ? 'var(--accent)' : 'var(--text-muted)' }}>
                {c.icon || '📁'} {c.name}
              </button>
            ))}
            <button className="btn-ghost" onClick={() => setShowFavorites(f => !f)}
              style={{ fontSize: '0.8rem', borderColor: showFavorites ? 'var(--warn)' : 'var(--border)', color: showFavorites ? 'var(--warn)' : 'var(--text-muted)' }}>
              ★ Favorites
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '24px 32px' }}>
        {/* Search results */}
        {searchResults !== null ? (
          <div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '16px' }}>{searchResults.length} results for "{searchQuery}"</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {searchResults.map((r, i) => (
                <div key={r.chunk_id} className="glass-card expand-enter citation-highlight" style={{ padding: '14px 18px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                        <span style={{ color: 'var(--accent)', fontSize: '0.75rem', fontWeight: 600 }}>#{i+1}</span>
                        <span style={{ fontWeight: 500, fontSize: '0.9rem' }}>{r.doc_title}</span>
                        {r.page_number && <span className="badge" style={{ fontSize: '0.7rem' }}>p.{r.page_number}</span>}
                      </div>
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>{r.fragment}</p>
                    </div>
                    <div style={{ textAlign: 'right', minWidth: '60px' }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--accent)', fontWeight: 600 }}>{(r.score * 100).toFixed(0)}%</div>
                      <div className="score-bar" style={{ width: `${r.score * 100}%`, marginTop: '4px' }} />
                    </div>
                  </div>
                </div>
              ))}
              {searchResults.length === 0 && <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px' }}>No results found.</p>}
            </div>
          </div>
        ) : (
          <>
            {loading ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '14px' }}>
                {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
              </div>
            ) : filteredDocs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '80px 20px' }}>
                <div style={{ fontSize: '3rem', marginBottom: '16px' }}>📚</div>
                <h3 style={{ fontWeight: 600, marginBottom: '8px' }}>No documents yet</h3>
                <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>Add your first document to get started.</p>
                <a href="/upload" className="btn-primary">+ Add document</a>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '14px' }}>
                {filteredDocs.map(doc => (
                  <div key={doc.id} className="glass-card" style={{ padding: '18px', cursor: 'pointer', position: 'relative' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ fontSize: '1.4rem' }}>{SOURCE_ICONS[doc.source_type] || '📄'}</div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={() => toggleFavorite(doc.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', color: doc.is_favorite ? 'var(--warn)' : 'var(--border-light)' }}>★</button>
                      </div>
                    </div>
                    <h3 style={{ fontWeight: 600, fontSize: '0.95rem', marginTop: '10px', marginBottom: '6px', lineClamp: 2, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' as any }}>
                      {doc.title}
                    </h3>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      <span className={`badge ${doc.status === 'active' ? 'badge-green' : doc.status === 'archived' ? 'badge-warn' : doc.status === 'trashed' ? 'badge-error' : ''}`}>
                        {doc.status}
                      </span>
                      {doc.chunk_count && <span className="badge">{doc.chunk_count} chunks</span>}
                    </div>
                    
                    <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-subtle)' }}>
                        {new Date(doc.created_at).toLocaleDateString()}
                      </p>
                      
                      <div style={{ display: 'flex', gap: '10px' }}>
                        {statusFilter === 'active' && (
                          <button onClick={() => updateDocStatus(doc.id, 'archived')} style={{ background: 'none', border: 'none', color: 'var(--text-subtle)', fontSize: '0.7rem', cursor: 'pointer' }}>Archive</button>
                        )}
                        {statusFilter !== 'trashed' ? (
                          <button onClick={() => updateDocStatus(doc.id, 'trashed')} style={{ background: 'none', border: 'none', color: 'var(--error)', fontSize: '0.7rem', cursor: 'pointer' }}>Trash</button>
                        ) : (
                          <>
                            <button onClick={() => updateDocStatus(doc.id, 'active')} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: '0.7rem', cursor: 'pointer' }}>Restore</button>
                            <button onClick={() => updateDocStatus(doc.id, 'deleted')} style={{ background: 'none', border: 'none', color: 'var(--error)', fontSize: '0.7rem', cursor: 'pointer' }}>Delete</button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
