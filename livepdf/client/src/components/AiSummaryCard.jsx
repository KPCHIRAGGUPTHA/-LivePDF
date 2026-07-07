import React from 'react';

export default function AiSummaryCard({ summary, loading }) {
  if (loading) {
    return (
      <div style={styles.card}>
        <div style={styles.header}>
          <span style={styles.aiLabel}>✦ AI Summary</span>
        </div>
        <div style={styles.skeleton} />
        <div style={{ ...styles.skeleton, width: '80%' }} />
        <style>{`
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
          }
        `}</style>
      </div>
    );
  }

  if (!summary) return null;

  return (
    <div style={styles.card}>
      <div style={styles.header}>
        <span style={styles.aiLabel}>✦ AI Summary</span>
        <span style={styles.disclaimer}>AI-generated — verify important details</span>
      </div>
      <p style={styles.text}>{summary}</p>
    </div>
  );
}

const styles = {
  card: { background: '#fafaf8', border: '0.5px solid #e8e8e0', borderRadius: 8, padding: '12px 14px', margin: '8px 10px' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  aiLabel: { fontSize: 12, fontWeight: 600, color: '#7c6f64' },
  disclaimer: { fontSize: 10, color: '#aaa' },
  text: { fontSize: 13, color: '#333', lineHeight: 1.6, margin: 0 },
  skeleton: { height: 12, background: '#ebebeb', borderRadius: 4, marginBottom: 6, width: '100%', animation: 'pulse 1.5s infinite' },
};
