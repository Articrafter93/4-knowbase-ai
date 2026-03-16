'use client';

import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import { library as libApi, type DocumentChunk, type DocumentDetail } from '../../../../lib/api';

export default function DocumentDetailPage() {
  const params = useParams<{ documentId: string }>();
  const searchParams = useSearchParams();
  const [document, setDocument] = useState<DocumentDetail | null>(null);
  const [chunks, setChunks] = useState<DocumentChunk[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const highlightChunkId = searchParams.get('chunkId') || undefined;

  useEffect(() => {
    async function load() {
      if (!params.documentId) return;
      try {
        const payload = await libApi.getDocumentChunks(params.documentId, highlightChunkId);
        setDocument(payload.document);
        setChunks(payload.chunks);
        setError('');
      } catch (err) {
        setDocument(null);
        setChunks([]);
        setError(err instanceof Error ? err.message : 'Could not load document view.');
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [params.documentId, highlightChunkId]);

  if (loading) return <div style={{ padding: '32px' }}>Loading document view...</div>;
  if (error) return <div style={{ padding: '32px', color: 'var(--error)' }}>{error}</div>;
  if (!document) return <div style={{ padding: '32px' }}>Document not found.</div>;

  return (
    <div style={{ padding: '28px 32px', maxWidth: '980px', margin: '0 auto' }}>
      <Link href="/library" className="btn-ghost" style={{ marginBottom: '18px', display: 'inline-flex' }}>
        Back to library
      </Link>

      <div className="glass-card" style={{ padding: '22px 24px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'flex-start' }}>
          <div>
            <p style={{ fontSize: '0.72rem', color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Source document
            </p>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 700, marginTop: '6px', marginBottom: '10px' }}>{document.title}</h1>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <span className="badge">{document.source_type}</span>
              {(document.tags || []).map((tag) => (
                <span key={tag} className="badge">
                  {tag}
                </span>
              ))}
            </div>
          </div>
          {document.source_url ? (
            <a href={document.source_url} target="_blank" rel="noreferrer" className="btn-primary">
              Open original source
            </a>
          ) : null}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {chunks.map((chunk) => {
          const highlighted = chunk.id === highlightChunkId;
          return (
            <article
              key={chunk.id}
              className={highlighted ? 'citation-highlight glass-card' : 'glass-card'}
              style={{
                padding: '16px 18px',
                borderColor: highlighted ? 'var(--accent)' : 'var(--glass-border)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', marginBottom: '8px' }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <span className="badge">{highlighted ? 'Linked citation' : 'Chunk'}</span>
                  {chunk.section_title ? <span style={{ color: 'var(--text-subtle)', fontSize: '0.75rem' }}>{chunk.section_title}</span> : null}
                </div>
                {chunk.page_number ? <span style={{ color: 'var(--text-subtle)', fontSize: '0.75rem' }}>Page {chunk.page_number}</span> : null}
              </div>
              <p style={{ whiteSpace: 'pre-wrap', color: 'var(--text)', lineHeight: 1.7 }}>{chunk.text}</p>
            </article>
          );
        })}
      </div>
    </div>
  );
}
