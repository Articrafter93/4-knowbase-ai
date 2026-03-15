'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { library as libApi, search as searchApi } from '../../../lib/api';

type SearchResult = {
  chunk_id: string;
  document_id: string;
  doc_title: string;
  fragment: string;
  score: number;
  page_number?: number;
  source_type?: string;
};

type DocumentItem = {
  id: string;
  title: string;
  source_type: string;
  status: string;
  is_favorite: boolean;
  chunk_count?: number;
  word_count?: number;
  created_at: string;
  tags?: string[];
};

const SOURCE_ICONS: Record<string, string> = {
  pdf: 'PDF',
  docx: 'DOC',
  txt: 'TXT',
  markdown: 'MD',
  url: 'URL',
  image: 'IMG',
  audio: 'AUD',
  note: 'NOTE',
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
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [collections, setCollections] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [selectedCollection, setSelectedCollection] = useState<string | undefined>();
  const [showFavorites, setShowFavorites] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'active' | 'archived' | 'trashed'>('active');
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      libApi.getDocuments(selectedCollection, statusFilter, showFavorites),
      libApi.getCollections(),
    ])
      .then(([docs, cols]) => {
        setDocuments(docs);
        setCollections(cols);
      })
      .finally(() => setLoading(false));
  }, [selectedCollection, statusFilter, showFavorites]);

  async function handleSearch(query: string) {
    setSearchQuery(query);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setSearchResults(null);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const response = await searchApi.query({
          q: query,
          collectionId: selectedCollection,
        });
        setSearchResults(response.results);
      } finally {
        setSearching(false);
      }
    }, 300);
  }

  async function handleToggleFavorite(id: string) {
    const response = await libApi.toggleFavorite(id);
    setDocuments((current) =>
      current.map((document) =>
        document.id === id ? { ...document, is_favorite: response.is_favorite } : document,
      ),
    );
  }

  async function updateDocStatus(id: string, newStatus: string) {
    if (newStatus === 'deleted') {
      await libApi.deleteDocument(id);
      setDocuments((current) => current.filter((document) => document.id !== id));
      return;
    }

    await libApi.updateDocumentStatus(id, newStatus);
    if (newStatus !== statusFilter) {
      setDocuments((current) => current.filter((document) => document.id !== id));
      return;
    }
    setDocuments((current) =>
      current.map((document) => (document.id === id ? { ...document, status: newStatus } : document)),
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '24px 32px 0', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '4px', letterSpacing: '-0.02em' }}>
              Library
            </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
              {documents.length} documents in your knowledge base
            </p>
          </div>
          <Link href="/upload" className="btn-primary">
            Add document
          </Link>
        </div>

        <div style={{ position: 'relative', marginBottom: '20px' }}>
          <input
            id="library-search"
            className="input"
            style={{ paddingLeft: '16px', paddingRight: '92px' }}
            placeholder="Search your knowledge base"
            value={searchQuery}
            onChange={(event) => void handleSearch(event.target.value)}
          />
          {searching && (
            <span
              style={{
                position: 'absolute',
                right: '14px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-subtle)',
                fontSize: '0.75rem',
              }}
            >
              Searching
            </span>
          )}
        </div>

        <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: '4px', background: 'rgba(255,255,255,0.05)', padding: '4px', borderRadius: '8px' }}>
            {(['active', 'archived', 'trashed'] as const).map((status) => (
              <button
                key={status}
                className="btn-ghost"
                style={{
                  fontSize: '0.75rem',
                  padding: '4px 12px',
                  textTransform: 'capitalize',
                  borderColor: statusFilter === status ? 'var(--accent)' : 'transparent',
                  color: statusFilter === status ? 'var(--accent)' : 'var(--text-muted)',
                }}
                onClick={() => setStatusFilter(status)}
              >
                {status === 'active' ? 'Files' : status}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: '8px', overflowX: 'auto' }}>
            <button
              className="btn-ghost"
              onClick={() => {
                setSelectedCollection(undefined);
                setShowFavorites(false);
              }}
              style={{
                whiteSpace: 'nowrap',
                fontSize: '0.8rem',
                borderColor: !selectedCollection && !showFavorites ? 'var(--accent)' : 'var(--border)',
                color: !selectedCollection && !showFavorites ? 'var(--accent)' : 'var(--text-muted)',
              }}
            >
              All
            </button>
            {collections.map((collection) => (
              <button
                key={collection.id}
                className="btn-ghost"
                onClick={() => setSelectedCollection(collection.id)}
                style={{
                  whiteSpace: 'nowrap',
                  fontSize: '0.8rem',
                  borderColor: selectedCollection === collection.id ? 'var(--accent)' : 'var(--border)',
                  color: selectedCollection === collection.id ? 'var(--accent)' : 'var(--text-muted)',
                }}
              >
                {collection.icon || 'COL'} {collection.name}
              </button>
            ))}
            <button
              className="btn-ghost"
              onClick={() => setShowFavorites((current) => !current)}
              style={{
                fontSize: '0.8rem',
                borderColor: showFavorites ? 'var(--warn)' : 'var(--border)',
                color: showFavorites ? 'var(--warn)' : 'var(--text-muted)',
              }}
            >
              Favorites
            </button>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '24px 32px' }}>
        {searchResults !== null ? (
          <div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
              {searchResults.length} results for "{searchQuery}"
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {searchResults.map((result, index) => (
                <Link
                  key={result.chunk_id}
                  href={`/library/${result.document_id}?chunkId=${result.chunk_id}`}
                  className="glass-card citation-highlight"
                  style={{ padding: '14px 18px', textDecoration: 'none' }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                        <span style={{ color: 'var(--accent)', fontSize: '0.75rem', fontWeight: 600 }}>#{index + 1}</span>
                        <span style={{ fontWeight: 500, fontSize: '0.9rem', color: 'var(--text)' }}>{result.doc_title}</span>
                        {result.page_number && (
                          <span className="badge" style={{ fontSize: '0.7rem' }}>
                            p.{result.page_number}
                          </span>
                        )}
                      </div>
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>{result.fragment}</p>
                    </div>
                    <div style={{ textAlign: 'right', minWidth: '60px' }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--accent)', fontWeight: 600 }}>
                        {(result.score * 100).toFixed(0)}%
                      </div>
                      <div className="score-bar" style={{ width: `${result.score * 100}%`, marginTop: '4px' }} />
                    </div>
                  </div>
                </Link>
              ))}
              {searchResults.length === 0 && (
                <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px' }}>No results found.</p>
              )}
            </div>
          </div>
        ) : loading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '14px' }}>
            {Array.from({ length: 6 }).map((_, index) => (
              <SkeletonCard key={index} />
            ))}
          </div>
        ) : documents.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 20px' }}>
            <div style={{ fontSize: '3rem', marginBottom: '16px' }}>KB</div>
            <h3 style={{ fontWeight: 600, marginBottom: '8px' }}>No documents yet</h3>
            <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>Add your first document to get started.</p>
            <Link href="/upload" className="btn-primary">
              Add document
            </Link>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '14px' }}>
            {documents.map((document) => (
              <div key={document.id} className="glass-card" style={{ padding: '18px', position: 'relative' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div
                    style={{
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      color: 'var(--accent)',
                      letterSpacing: '0.08em',
                    }}
                  >
                    {SOURCE_ICONS[document.source_type] || 'DOC'}
                  </div>
                  <button
                    onClick={() => void handleToggleFavorite(document.id)}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '1rem',
                      color: document.is_favorite ? 'var(--warn)' : 'var(--border-light)',
                    }}
                  >
                    *
                  </button>
                </div>

                <Link
                  href={`/library/${document.id}`}
                  style={{
                    display: 'block',
                    textDecoration: 'none',
                    marginTop: '10px',
                    marginBottom: '6px',
                    color: 'var(--text)',
                    fontWeight: 600,
                    fontSize: '0.95rem',
                    lineHeight: 1.4,
                  }}
                >
                  {document.title}
                </Link>

                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  <span
                    className={`badge ${
                      document.status === 'active'
                        ? 'badge-green'
                        : document.status === 'archived'
                          ? 'badge-warn'
                          : 'badge-error'
                    }`}
                  >
                    {document.status}
                  </span>
                  {document.chunk_count ? <span className="badge">{document.chunk_count} chunks</span> : null}
                  {(document.tags || []).slice(0, 2).map((tag) => (
                    <span key={tag} className="badge">
                      {tag}
                    </span>
                  ))}
                </div>

                <div
                  style={{
                    marginTop: '12px',
                    paddingTop: '12px',
                    borderTop: '1px solid rgba(255,255,255,0.05)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-subtle)' }}>
                    {new Date(document.created_at).toLocaleDateString()}
                  </p>

                  <div style={{ display: 'flex', gap: '10px' }}>
                    {statusFilter === 'active' && (
                      <button
                        onClick={() => void updateDocStatus(document.id, 'archived')}
                        style={{ background: 'none', border: 'none', color: 'var(--text-subtle)', fontSize: '0.7rem', cursor: 'pointer' }}
                      >
                        Archive
                      </button>
                    )}
                    {statusFilter !== 'trashed' ? (
                      <button
                        onClick={() => void updateDocStatus(document.id, 'trashed')}
                        style={{ background: 'none', border: 'none', color: 'var(--error)', fontSize: '0.7rem', cursor: 'pointer' }}
                      >
                        Trash
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() => void updateDocStatus(document.id, 'active')}
                          style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: '0.7rem', cursor: 'pointer' }}
                        >
                          Restore
                        </button>
                        <button
                          onClick={() => void updateDocStatus(document.id, 'deleted')}
                          style={{ background: 'none', border: 'none', color: 'var(--error)', fontSize: '0.7rem', cursor: 'pointer' }}
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
