import React, { useState, useRef, useEffect } from 'react';
import ChatMessage from './ChatMessage';
import useChat from '../hooks/useChat';

export default function ChatPanel({ token, visible, onPageClick }) {
  const { messages, loading, sendMessage, clearChat } = useChat({ token });
  const [input, setInput] = useState('');
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function handleSend() {
    if (!input.trim() || loading) return;
    sendMessage(input.trim());
    setInput('');
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  if (!visible) return null;

  return (
    <div style={styles.panel}>
      <div style={styles.header}>
        <span style={styles.title}>Ask about this document</span>
        {messages.length > 0 && (
          <button style={styles.clearBtn} onClick={clearChat}>Clear</button>
        )}
      </div>

      <div style={styles.messages}>
        {messages.length === 0 && (
          <div style={styles.empty}>
            <p style={styles.emptyTitle}>Ask anything</p>
            <p style={styles.emptyHint}>Try: "What is the payment amount?" or "Summarize section 3"</p>
          </div>
        )}
        {messages.map((msg, i) => (
          <ChatMessage key={i} message={msg} onPageClick={onPageClick} />
        ))}
        <div ref={bottomRef} />
      </div>

      <div style={styles.inputArea}>
        <textarea
          style={styles.textarea}
          placeholder="Ask a question about this document…"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={2}
          disabled={loading}
        />
        <button
          style={{ ...styles.sendBtn, opacity: loading || !input.trim() ? 0.5 : 1 }}
          onClick={handleSend}
          disabled={loading || !input.trim()}
        >
          {loading ? '…' : '↑'}
        </button>
      </div>
    </div>
  );
}

const styles = {
  panel: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  header: { padding: '12px 14px', borderBottom: '0.5px solid #e0e0e0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 13, fontWeight: 500, color: '#1a1a1a' },
  clearBtn: { fontSize: 11, color: '#aaa', background: 'none', border: 'none', cursor: 'pointer', padding: 0 },
  messages: { flex: 1, overflow: 'auto', padding: '8px 0' },
  empty: { padding: '2rem 1rem', textAlign: 'center' },
  emptyTitle: { fontSize: 14, fontWeight: 500, color: '#555', marginBottom: 6 },
  emptyHint: { fontSize: 12, color: '#aaa', lineHeight: 1.5 },
  inputArea: { borderTop: '0.5px solid #e0e0e0', padding: '10px', display: 'flex', gap: 8, alignItems: 'flex-end' },
  textarea: { flex: 1, resize: 'none', border: '0.5px solid #d0d0d0', borderRadius: 8, padding: '8px 10px', fontSize: 13, outline: 'none', fontFamily: 'inherit', lineHeight: 1.5 },
  sendBtn: { width: 34, height: 34, borderRadius: 8, background: '#1a1a1a', color: '#fff', border: 'none', fontSize: 16, cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' },
};
