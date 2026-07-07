import React from 'react';

export default function StreamingText({ text, streaming }) {
  return (
    <p style={{ fontSize: 13, lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' }}>
      {text}
      {streaming && (
        <span style={{
          display: 'inline-block', width: 2, height: 14,
          background: '#555', marginLeft: 2,
          animation: 'blink 1s step-end infinite',
          verticalAlign: 'text-bottom',
        }} />
      )}
      <style>{`
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
      `}</style>
    </p>
  );
}
