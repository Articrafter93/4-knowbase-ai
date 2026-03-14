'use client';
import { useState, useRef, useEffect, useCallback } from 'react';

type Citation = {
  marker: string;
  doc_title: string;
  fragment: string;
  score: number;
  page_number?: number;
  section_title?: string;
  source_url?: string;
};

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[];
  streaming?: boolean;
  latency_ms?: number;
  feedback?: 'like' | 'dislike';
};

import { chat as chatApi } from '../../../lib/api';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

function CitationCard({ citation, index, highlighted }: { citation: Citation; index: number; highlighted: boolean }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div
      className={`citation-highlight${highlighted ? ' expand-enter' : ''}`}
      style={{ marginBottom: '8px', cursor: 'pointer', transition: 'all 200ms' }}
      onClick={() => setExpanded(!expanded)}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style={{ background: 'var(--accent)', color: '#fff', borderRadius: '4px', padding: '1px 7px', fontSize: '0.72rem', fontWeight: 700 }}>
            {citation.marker}
          </span>
          <span style={{ fontWeight: 500, fontSize: '0.85rem', color: 'var(--text)' }}>{citation.doc_title}</span>
          {citation.page_number && <span className="badge" style={{ fontSize: '0.68rem' }}>p.{citation.page_number}</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '0.72rem', color: 'var(--accent)', fontWeight: 600 }}>{(citation.score * 100).toFixed(0)}%</span>
          <span style={{ color: 'var(--text-subtle)', fontSize: '0.8rem' }}>{expanded ? '▲' : '▼'}</span>
        </div>
      </div>
      {expanded && (
        <div className="expand-enter" style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid var(--border)' }}>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>{citation.fragment}</p>
          {citation.source_url && (
            <a href={citation.source_url} target="_blank" rel="noopener" style={{ display: 'inline-block', marginTop: '8px', fontSize: '0.75rem', color: 'var(--accent)', textDecoration: 'none' }}>
              → View source
            </a>
          )}
        </div>
      )}
    </div>
  );
}

function MessageBubble({ message, onFeedback }: { message: Message; onFeedback: (id: string, type: 'like' | 'dislike') => void }) {
  const isUser = message.role === 'user';
  return (
    <div className="expand-enter" style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: isUser ? 'flex-end' : 'flex-start',
      marginBottom: '20px',
    }}>
      <div style={{ position: 'relative', maxWidth: '78%', width: '100%', display: 'flex', flexDirection: isUser ? 'row-reverse' : 'row', gap: '8px', alignItems: 'flex-start' }}>
        <div style={{
          flex: 1,
          background: isUser ? 'var(--accent-dim)' : 'var(--surface)',
          border: `1px solid ${isUser ? 'rgba(91,140,255,0.25)' : 'var(--border)'}`,
          borderRadius: isUser ? '16px 16px 4px 16px' : '4px 16px 16px 16px',
          padding: '12px 16px',
          fontSize: '0.9rem',
          lineHeight: 1.65,
          color: 'var(--text)',
        }}>
          <div className={message.streaming ? 'streaming-cursor' : ''}>
            {message.content || (message.streaming ? '' : '…')}
          </div>
          {message.latency_ms && (
            <div style={{ marginTop: '6px', fontSize: '0.7rem', color: 'var(--text-subtle)' }}>
              {(message.latency_ms / 1000).toFixed(1)}s
            </div>
          )}
        </div>

        {!isUser && !message.streaming && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', paddingTop: '4px' }}>
            <button
              onClick={() => onFeedback(message.id, 'like')}
              style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: '4px', borderRaduis: '4px',
                color: message.feedback === 'like' ? 'var(--accent2)' : 'var(--text-subtle)',
                opacity: message.feedback && message.feedback !== 'like' ? 0.3 : 1, transition: 'all 200ms'
              }}
              title="Helpful"
            >
              👍
            </button>
            <button
              onClick={() => onFeedback(message.id, 'dislike')}
              style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: '4px', borderRaduis: '4px',
                color: message.feedback === 'dislike' ? 'var(--error)' : 'var(--text-subtle)',
                opacity: message.feedback && message.feedback !== 'dislike' ? 0.3 : 1, transition: 'all 200ms'
              }}
              title="Not helpful"
            >
              👎
            </button>
          </div>
        )}
      </div>

      {message.citations && message.citations.length > 0 && (
        <div style={{ maxWidth: '78%', width: '100%', marginTop: '10px' }}>
          <p style={{ fontSize: '0.72rem', color: 'var(--text-subtle)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 500 }}>
            Sources ({message.citations.length})
          </p>
          {message.citations.map((c, i) => (
            <CitationCard key={i} citation={c} index={i} highlighted />
          ))}
        </div>
      )}
    </div>
  );
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = useCallback(async () => {
    if (!input.trim() || loading) return;
    const query = input.trim();
    setInput('');
    setLoading(true);

    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: query };
    const assistantId = (Date.now() + 1).toString();
    const assistantMsg: Message = { id: assistantId, role: 'assistant', content: '', streaming: true, citations: [] };
    setMessages(prev => [...prev, userMsg, assistantMsg]);

    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('kb_access_token') : '';
      const response = await fetch(`${API_BASE}/api/v1/chat/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ query }),
      });

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';
      let citations: Citation[] = [];
      let latency = 0;

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === 'delta') {
              fullContent += event.content;
              setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: fullContent } : m));
            } else if (event.type === 'citations') {
              citations = event.content;
              setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, citations } : m));
            } else if (event.type === 'done') {
              latency = event.latency_ms;
            }
          } catch {}
        }
      }
      setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, streaming: false, latency_ms: latency } : m));
    } catch (e) {
      setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: 'Error retrieving response. Please try again.', streaming: false } : m));
    } finally {
      setLoading(false);
    }
  }, [input, loading]);

  const handleFeedback = async (id: string, type: 'like' | 'dislike') => {
    try {
      await chatApi.giveFeedback(id, type);
      setMessages(prev => prev.map(m => m.id === id ? { ...m, feedback: type } : m));
    } catch (e) {
      console.error('Failed to send feedback', e);
    }
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      {/* Header */}
      <div style={{ padding: '18px 28px', borderBottom: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent2)', boxShadow: '0 0 8px var(--accent2)' }} />
        <h1 style={{ fontSize: '1rem', fontWeight: 600 }}>Chat with your knowledge base</h1>
        <span style={{ marginLeft: 'auto', fontSize: '0.78rem', color: 'var(--text-subtle)' }}>RAG · pgvector</span>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflow: 'auto', padding: '28px' }}>
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '16px' }}>◈</div>
            <h2 style={{ fontWeight: 600, fontSize: '1.1rem', marginBottom: '8px', letterSpacing: '-0.02em' }}>Ask your knowledge base anything</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', maxWidth: '420px', margin: '0 auto' }}>
              Get answers with cited sources, summaries, comparisons and extracted insights — all from your documents.
            </p>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '28px', flexWrap: 'wrap' }}>
              {['Summarize my recent documents', 'What are the key themes?', 'Compare these two sources'].map(s => (
                <button key={s} className="btn-ghost" onClick={() => setInput(s)} style={{ fontSize: '0.8rem' }}>{s}</button>
              ))}
            </div>
          </div>
        )}
        {messages.map(m => <MessageBubble key={m.id} message={m} onFeedback={handleFeedback} />)}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', background: 'var(--surface)' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', maxWidth: '900px', margin: '0 auto' }}>
          <textarea
            id="chat-input"
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Ask anything about your documents… (Enter to send)"
            rows={2}
            style={{
              flex: 1, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
              color: 'var(--text)', padding: '12px 16px', fontSize: '0.9rem', resize: 'none',
              outline: 'none', lineHeight: 1.55, fontFamily: 'inherit',
              transition: 'border-color var(--transition)',
            }}
            onFocus={e => e.target.style.borderColor = 'var(--accent)'}
            onBlur={e => e.target.style.borderColor = 'var(--border)'}
          />
          <button
            id="chat-send"
            onClick={sendMessage}
            disabled={loading || !input.trim()}
            className="btn-primary"
            style={{ padding: '12px 20px', alignSelf: 'flex-end' }}
          >
            {loading ? <span style={{ display: 'inline-block', animation: 'skeleton-pulse 1s infinite' }}>…</span> : '⟩'}
          </button>
        </div>
        <p style={{ textAlign: 'center', fontSize: '0.7rem', color: 'var(--text-subtle)', marginTop: '8px' }}>
          Responses include citations linked to original sources. Retrieval: pgvector.
        </p>
      </div>
    </div>
  );
}
