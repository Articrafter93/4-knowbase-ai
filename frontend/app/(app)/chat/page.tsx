'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

type Citation = {
  marker: string;
  doc_title: string;
  fragment: string;
  score: number;
  page_number?: number;
  section_title?: string;
  source_url?: string;
};

  citations?: Citation[];
  streaming?: boolean;
  latency_ms?: number;
  feedback?: 'like' | 'dislike';
  engine?: string;
};

import { chat as chatApi } from '../../../lib/api';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

function CitationCard({ citation, index, highlighted, onSelect }: { citation: Citation; index: number; highlighted: boolean; onSelect: (c: Citation) => void }) {
  return (
    <div
      className={`citation-highlight${highlighted ? ' expand-enter' : ''}`}
      style={{ marginBottom: '8px', cursor: 'pointer', transition: 'all 200ms' }}
      onClick={() => onSelect(citation)}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(91,140,255,0.25)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--accent-dim)')}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style={{ background: 'var(--accent)', color: '#fff', borderRadius: '4px', padding: '1px 7px', fontSize: '0.72rem', fontWeight: 700 }}>
            {citation.marker}
          </span>
          <span style={{ fontWeight: 500, fontSize: '0.85rem', color: 'var(--text)' }}>{citation.doc_title}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '0.72rem', color: 'var(--accent2)', fontWeight: 600 }}>{(citation.score * 100).toFixed(0)}%</span>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message, onFeedback, onSelectCitation }: { message: Message; onFeedback: (id: string, type: 'like' | 'dislike') => void; onSelectCitation: (c: Citation) => void }) {
  const isUser = message.role === 'user';
  return (
    <div className="expand-enter" style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: isUser ? 'flex-end' : 'flex-start',
      marginBottom: '28px',
    }}>
      <div style={{ position: 'relative', maxWidth: '85%', width: '100%', display: 'flex', flexDirection: isUser ? 'row-reverse' : 'row', gap: '8px', alignItems: 'flex-start' }}>
        <div style={{
          flex: 1,
          background: isUser ? 'var(--accent-dim)' : 'var(--surface)',
          border: `1px solid ${isUser ? 'rgba(91,140,255,0.25)' : 'var(--border)'}`,
          borderRadius: isUser ? '16px 16px 4px 16px' : '4px 20px 20px 20px',
          padding: '16px 20px',
          fontSize: '0.92rem',
          lineHeight: 1.7,
          color: 'var(--text)',
          boxShadow: isUser ? 'none' : '0 4px 12px rgba(0,0,0,0.1)',
        }}>
          <div className={message.streaming ? 'streaming-cursor' : ''} style={{ whiteSpace: 'pre-wrap' }}>
            {message.content || (message.streaming ? 'Refining context...' : '…')}
          </div>
          {message.latency_ms && (
            <div style={{ marginTop: '8px', fontSize: '0.7rem', color: 'var(--text-subtle)', display: 'flex', gap: '8px' }}>
              <span>Engine: {message.engine || 'pgvector'}</span>
              <span>•</span>
              <span>Latency: {(message.latency_ms / 1000).toFixed(1)}s</span>
            </div>
          )}
        </div>

        {!isUser && !message.streaming && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', paddingTop: '4px' }}>
            <button
              onClick={() => onFeedback(message.id, 'like')}
              className="btn-ghost"
              style={{ padding: '6px', borderRadius: '6px', border: 'none', background: message.feedback === 'like' ? 'var(--accent2-dim)' : 'transparent' }}
            >
              👍
            </button>
            <button
              onClick={() => onFeedback(message.id, 'dislike')}
              className="btn-ghost"
              style={{ padding: '6px', borderRadius: '6px', border: 'none', background: message.feedback === 'dislike' ? 'rgba(255,93,115,0.1)' : 'transparent' }}
            >
              👎
            </button>
          </div>
        )}
      </div>

      {message.citations && message.citations.length > 0 && (
        <div style={{ maxWidth: '85%', width: '100%', marginTop: '14px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '8px' }}>
          {message.citations.map((c, i) => (
            <CitationCard key={i} citation={c} index={i} highlighted onSelect={onSelectCitation} />
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
  const [selectedCitation, setSelectedCitation] = useState<Citation | null>(null);
  const [ragStatus, setRagStatus] = useState<string | null>(null);
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
    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: query };
    const assistantId = (Date.now() + 1).toString();
    const assistantMsg: Message = { id: assistantId, role: 'assistant', content: '', streaming: true, citations: [] };
    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setRagStatus('Initializing...');

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
      let engine = 'Hybrid (pgvector + Qdrant)';

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
              // Block-based update: update only if content length changed significantly or ends with punctuation/newline
              if (fullContent.length % 10 === 0 || fullContent.endsWith('.') || fullContent.endsWith('\n')) {
                setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: fullContent } : m));
              }
            } else if (event.type === 'status') {
              setRagStatus(event.content);
            } else if (event.type === 'citations') {
              citations = event.content;
              setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, citations } : m));
            } else if (event.type === 'done') {
              latency = event.latency_ms;
            }
          } catch {}
        }
      }
      setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: fullContent, streaming: false, latency_ms: latency, engine } : m));
    } catch (e) {
      setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: 'Error retrieving response. Please check your connection.', streaming: false } : m));
    } finally {
      setLoading(false);
      setRagStatus(null);
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
        {messages.map(m => <MessageBubble key={m.id} message={m} onFeedback={handleFeedback} onSelectCitation={setSelectedCitation} />)}
        
        {ragStatus && (
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', padding: '16px', borderRadius: '12px', background: 'var(--surface)', border: '1px solid var(--border)', maxWidth: '300px', margin: '20px 0' }}>
            <div className="skeleton" style={{ width: '16px', height: '16px', borderRadius: '50%' }} />
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{ragStatus}</span>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Right Panel Portal */}
      {typeof document !== 'undefined' && document.getElementById('right-panel-content') && 
        createPortal(
          <div className="fade-rise">
            {selectedCitation ? (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
                  <span style={{ background: 'var(--accent)', color: '#fff', borderRadius: '4px', padding: '2px 8px', fontSize: '0.8rem', fontWeight: 700 }}>
                    {selectedCitation.marker}
                  </span>
                  <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Source Detail</h3>
                </div>

                <div className="glass-card" style={{ padding: '16px', marginBottom: '20px' }}>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', marginBottom: '4px', textTransform: 'uppercase' }}>Document</p>
                  <p style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text)', marginBottom: '12px' }}>{selectedCitation.doc_title}</p>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <p style={{ fontSize: '0.7rem', color: 'var(--text-subtle)' }}>Confidence</p>
                      <p style={{ fontWeight: 600, color: 'var(--accent2)' }}>{(selectedCitation.score * 100).toFixed(1)}%</p>
                    </div>
                    <div>
                      <p style={{ fontSize: '0.7rem', color: 'var(--text-subtle)' }}>Page</p>
                      <p style={{ fontWeight: 600 }}>{selectedCitation.page_number || 'N/A'}</p>
                    </div>
                  </div>
                </div>

                <div style={{ marginBottom: '20px' }}>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', marginBottom: '8px', textTransform: 'uppercase' }}>Cited Fragment</p>
                  <div style={{ 
                    padding: '16px', 
                    background: 'rgba(91,140,255,0.05)', 
                    border: '1px solid var(--glass-border)', 
                    borderRadius: '8px',
                    fontSize: '0.875rem',
                    lineHeight: 1.6,
                    color: 'var(--text-muted)',
                    fontStyle: 'italic'
                  }}>
                    "{selectedCitation.fragment}"
                  </div>
                </div>

                <button 
                  onClick={() => setSelectedCitation(null)}
                  className="btn-ghost" 
                  style={{ width: '100%', justifyContent: 'center' }}
                >
                  Clear Selection
                </button>
              </div>
            ) : (
              <div style={{ textAlign: 'center', paddingTop: '60px', color: 'var(--text-subtle)' }}>
                <div style={{ fontSize: '2rem', marginBottom: '16px', opacity: 0.5 }}>🧭</div>
                <p style={{ fontSize: '0.8rem' }}>Select a result or citation to see technical details.</p>
              </div>
            )}
          </div>,
          document.getElementById('right-panel-content')!
        )
      }

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
