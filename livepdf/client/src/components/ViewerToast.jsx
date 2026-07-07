import { useEffect, useState } from 'react';

export default function ViewerToast({ message, onDismiss }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (!message) return;
    setVisible(true);
    const timer = setTimeout(() => {
      setVisible(false);
      onDismiss?.();
    }, 4000);
    return () => clearTimeout(timer);
  }, [message, onDismiss]);

  if (!visible || !message) return null;

  return (
    <div style={styles.toast}>
      <span style={styles.icon}>🔄</span>
      <span style={styles.text}>{message}</span>
      <button style={styles.close} onClick={() => { setVisible(false); onDismiss?.(); }}>✕</button>
    </div>
  );
}

const styles = {
  toast: {
    position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
    background: '#1a1a1a', color: '#fff', borderRadius: 8,
    padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10,
    fontSize: 13, zIndex: 999, boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
    animation: 'slideUp 0.25s ease',
  },
  icon: { fontSize: 15 },
  text: { flex: 1 },
  close: { background: 'none', border: 'none', color: '#aaa', cursor: 'pointer', fontSize: 14, padding: 0 },
};
