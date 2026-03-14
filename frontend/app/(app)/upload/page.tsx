'use client';
import { useState, useCallback, useRef } from 'react';
import { ingest } from '../../../lib/api';

type JobStatus = { document_id: string; job_id: string; status: string; progress: number; error_message?: string };

export default function UploadPage() {
  const [dragging, setDragging] = useState(false);
  const [jobs, setJobs] = useState<JobStatus[]>([]);
  const [urlInput, setUrlInput] = useState('');
  const [urlLoading, setUrlLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<Record<string, NodeJS.Timeout>>({});

  const pollJob = useCallback((doc_id: string, job_id: string) => {
    const interval = setInterval(async () => {
      try {
        const status = await ingest.getJobStatus(job_id);
        setJobs(prev => prev.map(j => j.job_id === job_id ? { ...j, ...status } : j));
        if (['completed', 'failed'].includes(status.status)) {
          clearInterval(interval);
          delete pollRef.current[job_id];
        }
      } catch {}
    }, 2000);
    pollRef.current[job_id] = interval;
  }, []);

  const handleFiles = useCallback(async (files: FileList) => {
    for (const file of Array.from(files)) {
      const res = await ingest.uploadFile(file);
      setJobs(prev => [...prev, { document_id: res.document_id, job_id: res.job_id, status: 'queued', progress: 0 }]);
      pollJob(res.document_id, res.job_id);
    }
  }, [pollJob]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const handleUrl = async () => {
    if (!urlInput.trim()) return;
    setUrlLoading(true);
    try {
      const res = await ingest.ingestUrl(urlInput.trim());
      setJobs(prev => [...prev, { document_id: res.document_id, job_id: res.job_id, status: 'queued', progress: 0 }]);
      pollJob(res.document_id, res.job_id);
      setUrlInput('');
    } finally { setUrlLoading(false); }
  };

  const statusColor: Record<string, string> = {
    queued: 'var(--text-subtle)', parsing: 'var(--warn)', chunking: 'var(--warn)',
    embedding: 'var(--accent)', storing: 'var(--accent)', completed: 'var(--accent2)', failed: 'var(--error)',
  };

  return (
    <div className="fade-rise" style={{ maxWidth: '780px', margin: '0 auto', padding: '40px 24px' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.03em', marginBottom: '6px' }}>Add to Knowledge Base</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: '36px' }}>Upload files or paste URLs — content is indexed automatically.</p>

      {/* Drop zone */}
      <div
        id="upload-dropzone"
        className="glass-card"
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileRef.current?.click()}
        style={{
          padding: '52px 24px', textAlign: 'center', cursor: 'pointer',
          borderStyle: dragging ? 'solid' : 'dashed',
          borderColor: dragging ? 'var(--accent)' : 'var(--border)',
          background: dragging ? 'var(--accent-dim)' : 'var(--glass)',
          transition: 'all 200ms',
          marginBottom: '24px',
        }}
      >
        <div style={{ fontSize: '2.2rem', marginBottom: '14px' }}>↑</div>
        <h3 style={{ fontWeight: 600, marginBottom: '8px' }}>Drag & drop files here</h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '18px' }}>
          PDF, DOCX, TXT, Markdown, Images (OCR) — up to {process.env.NEXT_PUBLIC_MAX_FILE_SIZE || 50}MB each
        </p>
        <button className="btn-ghost" style={{ pointerEvents: 'none' }}>Choose files</button>
        <input ref={fileRef} type="file" multiple accept=".pdf,.docx,.txt,.md,.png,.jpg,.jpeg,.webp"
          style={{ display: 'none' }} onChange={e => e.target.files && handleFiles(e.target.files)} />
      </div>

      {/* URL input */}
      <div className="glass-card" style={{ padding: '20px 24px', marginBottom: '32px' }}>
        <h3 style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '14px' }}>Ingest a URL</h3>
        <div style={{ display: 'flex', gap: '10px' }}>
          <input id="url-input" className="input" placeholder="https://example.com/article" value={urlInput}
            onChange={e => setUrlInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleUrl()} />
          <button className="btn-primary" disabled={urlLoading || !urlInput.trim()} onClick={handleUrl} style={{ whiteSpace: 'nowrap' }}>
            {urlLoading ? '…' : 'Add URL'}
          </button>
        </div>
      </div>

      {/* Job status list */}
      {jobs.length > 0 && (
        <div>
          <h3 style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '14px', color: 'var(--text-muted)' }}>Ingestion queue</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {jobs.map(job => (
              <div key={job.job_id} className="glass-card" style={{ padding: '14px 18px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text)' }}>{job.document_id.slice(0, 8)}…</span>
                  <span style={{ fontSize: '0.78rem', fontWeight: 600, color: statusColor[job.status] || 'var(--text-muted)' }}>
                    {job.status} {job.status !== 'completed' && job.status !== 'failed' ? `${job.progress}%` : ''}
                  </span>
                </div>
                {job.status !== 'completed' && job.status !== 'failed' && (
                  <div style={{ height: '3px', borderRadius: '99px', background: 'var(--border)', overflow: 'hidden' }}>
                    <div className="score-bar" style={{ width: `${job.progress}%`, height: '3px', transition: 'width 800ms ease' }} />
                  </div>
                )}
                {job.error_message && <p style={{ fontSize: '0.78rem', color: 'var(--error)', marginTop: '6px' }}>{job.error_message}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
