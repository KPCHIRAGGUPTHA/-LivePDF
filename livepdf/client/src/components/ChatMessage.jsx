import React from 'react';
import StreamingText from './StreamingText';

export default function ChatMessage({ message, onPageClick }) {
  const isUser = message.role === 'user';

  return (
    <div style={{ ...styles.wrap, justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
      <div style={{ ...styles.bubble, ...(isUser ? styles.userBubble : styles.aiBubble) }}>
        {isUser
          ? <p style={styles.text}>{message.content}</p>
          : <StreamingText text={message.content} streaming={message.streaming} />
        }

        {!isUser && message.pageRefs && message.pageRefs.length > 0 && (
          <div style={styles.refs}>
            <span style={styles.refLabel}>Sources:</span>
            {message.pageRefs.map(page => (
              <button
                key={page}
                style={styles.refBtn}
                onClick={() => onPageClick(page)}
              >
                p.{page}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  wrap: { display: 'flex', padding: '4px 10px' },
  bubble: { maxWidth: '85%', borderRadius: 10, padding: '8px 12px' },
  userBubble: { background: '#1a1a1a', color: '#fff' },
  aiBubble: { background: '#f5f5f3', color: '#1a1a1a', border: '0.5px solid #e8e8e0' },
  text: { fontSize: 13, lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' },
  refs: { display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', marginTop: 8, paddingTop: 6, borderTop: '0.5px solid #e0e0e0' },
  refLabel: { fontSize: 11, color: '#aaa' },
  refBtn: { fontSize: 11, padding: '2px 7px', background: '#fff', border: '0.5px solid #d0d0d0', borderRadius: 4, cursor: 'pointer', color: '#555' },
};
