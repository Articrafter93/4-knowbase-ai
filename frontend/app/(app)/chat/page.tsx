'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { chat as chatApi } from '../../../lib/api';

type Citation = {
  marker: string;
  chunk_id: string;
  document_id: string;
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
  engine?: string;
};

function CitationCard({
  citation,
  onSelect,
}: {
  citation: Citation;
  onSelect: (citation: Citation) => void;
}) {
  return (
    <button
      className="citation-highlight"
      style={{ marginBottom: '8px', cursor: 'pointer', transition: 'all 200ms', width: '100%', textAlign: 'left' }}
      onClick={() => onSelect(citation)}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style={{ background: 'var(--accent)', color: '#fff', borderRadius: '4px', padding: '1px 7px', fontSize: '0.72rem', fontWeight: 700 }}>
            {citation.marker}
          </span>
          <span style={{ fontWeight: 500, fontSize: '0.85rem', color: 'var(--text)' }}>{citation.doc_title}</span>
        </div>
        <span style={{ fontSize: '0.72rem', color: 'var(--accent2)', fontWeight: 600 }}>
          {(citation.score * 100).toFixed(0)}%
        </span>
      </div>
    </button>
  );
}

function MessageBubble({
  message,
  onFeedback,
  onSelectCitation,
}: {
  message: Message;
  onFeedback: (id: string, type: 'like' | 'dislike') => void;
  onSelectCitation: (citation: Citation) => void;
}) {
  const isUser = message.role === 'user';

  return (
    <div
      className="expand-enter"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: isUser ? 'flex-end' : 'flex-start',
        marginBottom: '28px',
      }}
    >
      <div
        style={{
          position: 'relative',
          maxWidth: '85%',
          width: '100%',
          display: 'flex',
          flexDirection: isUser ? 'row-reverse' : 'row',
          gap: '8px',
          alignItems: 'flex-start',
        }}
      >
        <div
          style={{
            flex: 1,
            background: isUser ? 'var(--accent-dim)' : 'var(--surface)',
            border: `1px solid ${isUser ? 'rgba(91,140,255,0.25)' : 'var(--border)'}`,
            borderRadius: isUser ? '16px 16px 4px 16px' : '4px 20px 20px 20px',
            padding: '16px 20px',
            fontSize: '0.92rem',
            lineHeight: 1.7,
            color: 'var(--text)',
          }}
        >
          <div className={message.streaming ? 'streaming-cursor' : ''} style={{ whiteSpace: 'pre-wrap' }}>
            {message.content || (message.streaming ? 'Retrieving context...' : '...')}
          </div>
          {message.latency_ms ? (
            <div style={{ marginTop: '8px', fontSize: '0.7rem', color: 'var(--text-subtle)', display: 'flex', gap: '8px' }}>
              <span>Engine: {message.engine || 'hybrid'}</span>
              <span>Latency: {(message.latency_ms / 1000).toFixed(1)}s</span>
            </div>
          ) : null}
        </div>

        {!isUser && !message.streaming ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', paddingTop: '4px' }}>
            <button
              onClick={() => onFeedback(message.id, 'like')}
              className="btn-ghost"
              style={{ padding: '6px', borderRadius: '6px', border: 'none', background: message.feedback === 'like' ? 'var(--accent2-dim)' : 'transparent' }}
            >
              +
            </button>
            <button
              onClick={() => onFeedback(message.id, 'dislike')}
              className="btn-ghost"
              style={{ padding: '6px', borderRadius: '6px', border: 'none', background: message.feedback === 'dislike' ? 'rgba(255,93,115,0.1)' : 'transparent' }}
            >
              -
            </button>
          </div>
        ) : null}
      </div>

      {message.citations && message.citations.length > 0 ? (
        <div style={{ maxWidth: '85%', width: '100%', marginTop: '14px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '8px' }}>
          {message.citations.map((citation) => (
            <CitationCard key={citation.chunk_id} citation={citation} onSelect={onSelectCitation} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedCitation, setSelectedCitation] = useState<Citation | null>(null);
  const [ragStatus, setRagStatus] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [isMobile, setIsMobile] = useState(false);
  const [mounted, setMounted] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const syncViewport = () => setIsMobile(window.innerWidth < 900);
    syncViewport();
    setMounted(true);
    window.addEventListener('resize', syncViewport);
    return () => window.removeEventListener('resize', syncViewport);
  }, []);

  async function sendMessage() {
    if (!input.trim() || loading) return;

    const query = input.trim();
    const userMessage: Message = { id: `user-${Date.now()}`, role: 'user', content: query };
    const assistantId = `assistant-${Date.now()}`;
    const assistantMessage: Message = { id: assistantId, role: 'assistant', content: '', streaming: true, citations: [] };

    setInput('');
    setLoading(true);
    setMessages((current) => [...current, userMessage, assistantMessage]);
    setRagStatus('Retrieving relevant sources');

    try {
      const response = await chatApi.stream({ query, conversation_id: conversationId });
      const reader = response.body?.getReader();
      if (!reader) throw new Error('Streaming not available');

      const decoder = new TextDecoder();
      let fullContent = '';
      let citations: Citation[] = [];
      let latency = 0;
      let engine = 'hybrid';
      let resolvedAssistantId = assistantId;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const event = JSON.parse(line.slice(6));
          if (event.type === 'delta') {
            fullContent += event.content;
            setMessages((current) =>
              current.map((message) =>
                message.id === assistantId ? { ...message, content: fullContent } : message,
              ),
            );
          } else if (event.type === 'status') {
            setRagStatus(event.content);
          } else if (event.type === 'citations') {
            citations = event.content;
            setMessages((current) =>
              current.map((message) =>
                message.id === assistantId ? { ...message, citations } : message,
              ),
            );
          } else if (event.type === 'done') {
            latency = event.latency_ms;
            engine = event.retrieval_metadata?.backend || 'hybrid';
            if (event.conversation_id) setConversationId(event.conversation_id);
            if (event.message_id) {
              resolvedAssistantId = event.message_id;
              setMessages((current) =>
                current.map((message) =>
                  message.id === assistantId ? { ...message, id: event.message_id } : message,
                ),
              );
            }
          } else if (event.type === 'error') {
            throw new Error(event.content);
          }
        }
      }

      setMessages((current) =>
        current.map((message) =>
          message.id === assistantId || message.id === resolvedAssistantId
            ? {
                ...message,
                content: fullContent,
                citations,
                streaming: false,
                latency_ms: latency,
                engine,
              }
            : message,
        ),
      );
    } catch (error) {
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantId
            ? { ...message, content: error instanceof Error ? error.message : 'Request failed', streaming: false }
            : message,
        ),
      );
    } finally {
      setLoading(false);
      setRagStatus(null);
    }
  }

  async function handleFeedback(id: string, type: 'like' | 'dislike') {
    await chatApi.giveFeedback(id, type);
    setMessages((current) =>
      current.map((message) => (message.id === id ? { ...message, feedback: type } : message)),
    );
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      <div style={{ padding: '18px 28px', borderBottom: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent2)', boxShadow: '0 0 8px var(--accent2)' }} />
        <h1 style={{ fontSize: '1rem', fontWeight: 600 }}>Chat with your knowledge base</h1>
        <span style={{ marginLeft: 'auto', fontSize: '0.78rem', color: 'var(--text-subtle)' }}>Hybrid retrieval</span>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '28px' }}>
        {messages.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <div style={{ fontSize: '2.2rem', marginBottom: '16px' }}>KB</div>
            <h2 style={{ fontWeight: 600, fontSize: '1.1rem', marginBottom: '8px', letterSpacing: '-0.02em' }}>
              Ask your knowledge base anything
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', maxWidth: '480px', margin: '0 auto' }}>
              Responses cite the exact chunk used, keep conversation history and let you jump straight to the source.
            </p>
          </div>
        ) : null}

        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} onFeedback={handleFeedback} onSelectCitation={setSelectedCitation} />
        ))}

        {ragStatus ? (
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', padding: '16px', borderRadius: '12px', background: 'var(--surface)', border: '1px solid var(--border)', maxWidth: '320px', margin: '20px 0' }}>
            <div className="skeleton" style={{ width: '16px', height: '16px', borderRadius: '50%' }} />
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{ragStatus}</span>
          </div>
        ) : null}

        {isMobile && selectedCitation ? (
          <div className="glass-card" style={{ padding: '16px', marginBottom: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', marginBottom: '10px' }}>
              <div>
                <p style={{ fontSize: '0.72rem', color: 'var(--text-subtle)', textTransform: 'uppercase' }}>Selected citation</p>
                <p style={{ fontWeight: 600, color: 'var(--text)' }}>{selectedCitation.doc_title}</p>
              </div>
              <button className="btn-ghost" onClick={() => setSelectedCitation(null)}>
                Clear
              </button>
            </div>
            <p style={{ color: 'var(--text-muted)', marginBottom: '10px' }}>{selectedCitation.fragment}</p>
            <Link href={`/library/${selectedCitation.document_id}?chunkId=${selectedCitation.chunk_id}`} className="btn-primary" style={{ justifyContent: 'center' }}>
              Open linked chunk
            </Link>
          </div>
        ) : null}

        <div ref={messagesEndRef} />
      </div>

      {mounted && !isMobile && typeof document !== 'undefined' && document.getElementById('right-panel-content')
        ? createPortal(
            <div className="fade-rise">
              {selectedCitation ? (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
                    <span style={{ background: 'var(--accent)', color: '#fff', borderRadius: '4px', padding: '2px 8px', fontSize: '0.8rem', fontWeight: 700 }}>
                      {selectedCitation.marker}
                    </span>
                    <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Source detail</h3>
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
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', marginBottom: '8px', textTransform: 'uppercase' }}>Cited fragment</p>
                    <div style={{ padding: '16px', background: 'rgba(91,140,255,0.05)', border: '1px solid var(--glass-border)', borderRadius: '8px', fontSize: '0.875rem', lineHeight: 1.6, color: 'var(--text-muted)' }}>
                      &ldquo;{selectedCitation.fragment}&rdquo;
                    </div>
                  </div>

                  <div style={{ display: 'grid', gap: '10px' }}>
                    <Link href={`/library/${selectedCitation.document_id}?chunkId=${selectedCitation.chunk_id}`} className="btn-primary" style={{ justifyContent: 'center' }}>
                      Open linked chunk
                    </Link>
                    {selectedCitation.source_url ? (
                      <a href={selectedCitation.source_url} target="_blank" rel="noreferrer" className="btn-ghost" style={{ justifyContent: 'center' }}>
                        Open original source
                      </a>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div style={{ textAlign: 'center', paddingTop: '60px', color: 'var(--text-subtle)' }}>
                  <div style={{ fontSize: '2rem', marginBottom: '16px', opacity: 0.5 }}>TRACE</div>
                  <p style={{ fontSize: '0.8rem' }}>Select a citation to inspect score, chunk and source navigation.</p>
                </div>
              )}
            </div>,
            document.getElementById('right-panel-content')!,
          )
        : null}

      <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', background: 'var(--surface)' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', maxWidth: '900px', margin: '0 auto' }}>
          <textarea
            id="chat-input"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void sendMessage();
              }
            }}
            placeholder="Ask anything about your documents"
            rows={2}
            style={{
              flex: 1,
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--text)',
              padding: '12px 16px',
              fontSize: '0.9rem',
              resize: 'none',
              outline: 'none',
              lineHeight: 1.55,
              fontFamily: 'inherit',
            }}
          />
          <button id="chat-send" onClick={() => void sendMessage()} disabled={loading || !input.trim()} className="btn-primary" style={{ padding: '12px 20px', alignSelf: 'flex-end' }}>
            {loading ? '...' : 'Send'}
          </button>
        </div>
        <p style={{ textAlign: 'center', fontSize: '0.7rem', color: 'var(--text-subtle)', marginTop: '8px' }}>
          Streaming by blocks, persistent conversation memory and source-linked citations.
        </p>
      </div>
    </div>
  );
}
