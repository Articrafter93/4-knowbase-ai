'use client';

import { useCallback, useRef, useState } from 'react';

import { ingest } from '../../../lib/api';

type JobStatus = {
  document_id: string;
  job_id: string;
  status: string;
  progress: number;
  error_message?: string;
};

export default function UploadPage() {
  const [dragging, setDragging] = useState(false);
  const [jobs, setJobs] = useState<JobStatus[]>([]);
  const [urlInput, setUrlInput] = useState('');
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [urlLoading, setUrlLoading] = useState(false);
  const [noteLoading, setNoteLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<Record<string, NodeJS.Timeout>>({});

  const tags = tagsInput
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  const pollJob = useCallback((jobId: string) => {
    const interval = setInterval(async () => {
      try {
        const status = await ingest.getJobStatus(jobId);
        setJobs((current) => current.map((job) => (job.job_id === jobId ? { ...job, ...status } : job)));
        if (['completed', 'failed'].includes(status.status)) {
          clearInterval(interval);
          delete pollRef.current[jobId];
        }
      } catch {
        clearInterval(interval);
        delete pollRef.current[jobId];
      }
    }, 2000);
    pollRef.current[jobId] = interval;
  }, []);

  const enqueueJob = useCallback(
    (payload: { document_id: string; job_id: string }) => {
      setJobs((current) => [
        { document_id: payload.document_id, job_id: payload.job_id, status: 'queued', progress: 0 },
        ...current,
      ]);
      pollJob(payload.job_id);
    },
    [pollJob],
  );

  const handleFiles = useCallback(
    async (files: FileList) => {
      for (const file of Array.from(files)) {
        const response = await ingest.uploadFile(file, undefined, tags);
        enqueueJob(response);
      }
    },
    [enqueueJob, tags],
  );

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      setDragging(false);
      if (event.dataTransfer.files.length) {
        void handleFiles(event.dataTransfer.files);
      }
    },
    [handleFiles],
  );

  async function handleUrl() {
    if (!urlInput.trim()) return;
    setUrlLoading(true);
    try {
      const response = await ingest.ingestUrl(urlInput.trim(), undefined, tags);
      enqueueJob(response);
      setUrlInput('');
    } finally {
      setUrlLoading(false);
    }
  }

  async function handleNote() {
    if (!noteTitle.trim() || !noteContent.trim()) return;
    setNoteLoading(true);
    try {
      const response = await ingest.ingestNote(noteTitle.trim(), noteContent.trim(), undefined, tags);
      enqueueJob(response);
      setNoteTitle('');
      setNoteContent('');
    } finally {
      setNoteLoading(false);
    }
  }

  const statusColor: Record<string, string> = {
    queued: 'var(--text-subtle)',
    parsing: 'var(--warn)',
    chunking: 'var(--warn)',
    embedding: 'var(--accent)',
    storing: 'var(--accent)',
    completed: 'var(--accent2)',
    failed: 'var(--error)',
  };

  return (
    <div className="fade-rise" style={{ maxWidth: '820px', margin: '0 auto', padding: '40px 24px' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.03em', marginBottom: '6px' }}>
        Add to Knowledge Base
      </h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: '18px' }}>
        Upload files, links and notes. Audio is transcribed before indexing and every item keeps source metadata.
      </p>

      <div className="glass-card" style={{ padding: '18px 20px', marginBottom: '24px' }}>
        <label htmlFor="tags-input" style={{ display: 'block', marginBottom: '8px', fontSize: '0.8rem', color: 'var(--text-subtle)' }}>
          Tags
        </label>
        <input
          id="tags-input"
          className="input"
          placeholder="research, contracts, onboarding"
          value={tagsInput}
          onChange={(event) => setTagsInput(event.target.value)}
        />
      </div>

      <div
        id="upload-dropzone"
        className="glass-card"
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileRef.current?.click()}
        style={{
          padding: '52px 24px',
          textAlign: 'center',
          cursor: 'pointer',
          borderStyle: dragging ? 'solid' : 'dashed',
          borderColor: dragging ? 'var(--accent)' : 'var(--border)',
          background: dragging ? 'var(--accent-dim)' : 'var(--glass)',
          transition: 'all 200ms',
          marginBottom: '24px',
        }}
      >
        <div style={{ fontSize: '2.2rem', marginBottom: '14px' }}>INGEST</div>
        <h3 style={{ fontWeight: 600, marginBottom: '8px' }}>Drop files here</h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '18px' }}>
          PDF, DOCX, TXT, Markdown, images and audio
        </p>
        <button className="btn-ghost" style={{ pointerEvents: 'none' }}>
          Choose files
        </button>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept=".pdf,.docx,.txt,.md,.png,.jpg,.jpeg,.webp,.mp3,.mp4,.m4a,.wav,.ogg,.webm,.flac"
          style={{ display: 'none' }}
          onChange={(event) => {
            if (event.target.files) {
              void handleFiles(event.target.files);
            }
          }}
        />
      </div>

      <div className="glass-card" style={{ padding: '20px 24px', marginBottom: '20px' }}>
        <h3 style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '14px' }}>Ingest a URL</h3>
        <div style={{ display: 'flex', gap: '10px' }}>
          <input
            id="url-input"
            className="input"
            placeholder="https://example.com/article"
            value={urlInput}
            onChange={(event) => setUrlInput(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && void handleUrl()}
          />
          <button className="btn-primary" disabled={urlLoading || !urlInput.trim()} onClick={() => void handleUrl()}>
            {urlLoading ? '...' : 'Add URL'}
          </button>
        </div>
      </div>

      <div className="glass-card" style={{ padding: '20px 24px', marginBottom: '32px' }}>
        <h3 style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '14px' }}>Create a note</h3>
        <div style={{ display: 'grid', gap: '10px' }}>
          <input
            className="input"
            placeholder="Meeting recap"
            value={noteTitle}
            onChange={(event) => setNoteTitle(event.target.value)}
          />
          <textarea
            className="input"
            style={{ minHeight: '160px', resize: 'vertical' }}
            placeholder="Paste notes, decisions, todos or observations"
            value={noteContent}
            onChange={(event) => setNoteContent(event.target.value)}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn-primary" disabled={noteLoading || !noteTitle.trim() || !noteContent.trim()} onClick={() => void handleNote()}>
              {noteLoading ? 'Saving...' : 'Save note'}
            </button>
          </div>
        </div>
      </div>

      {jobs.length > 0 ? (
        <div>
          <h3 style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '14px', color: 'var(--text-muted)' }}>
            Ingestion queue
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {jobs.map((job) => (
              <div key={job.job_id} className="glass-card" style={{ padding: '14px 18px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text)' }}>{job.document_id.slice(0, 8)}</span>
                  <span style={{ fontSize: '0.78rem', fontWeight: 600, color: statusColor[job.status] || 'var(--text-muted)' }}>
                    {job.status} {job.status !== 'completed' && job.status !== 'failed' ? `${job.progress}%` : ''}
                  </span>
                </div>
                {job.status !== 'completed' && job.status !== 'failed' ? (
                  <div style={{ height: '3px', borderRadius: '99px', background: 'var(--border)', overflow: 'hidden' }}>
                    <div className="score-bar" style={{ width: `${job.progress}%`, height: '3px', transition: 'width 800ms ease' }} />
                  </div>
                ) : null}
                {job.error_message ? (
                  <p style={{ fontSize: '0.78rem', color: 'var(--error)', marginTop: '6px' }}>{job.error_message}</p>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
