import ChangeBadge from './ChangeBadge';

export default function DiffTooltip({ change, position, onClose }) {
  return (
    <div style={{ ...styles.tooltip, left: position.x + 12, top: position.y - 8 }}>
      <div style={styles.header}>
        <ChangeBadge type={change.type} />
        <ChangeBadge importance={change.importance} />
        <button style={styles.close} onClick={onClose}>✕</button>
      </div>

      <div style={styles.content}>
        {change.type === 'MODIFIED' && (
          <div style={styles.compare}>
            <div style={styles.oldBox}>
              <span style={styles.oldLabel}>Before</span>
              <p style={styles.text}>{change.old_text}</p>
            </div>
            <div style={styles.arrow}>→</div>
            <div style={styles.newBox}>
              <span style={styles.newLabel}>After</span>
              <p style={styles.text}>{change.new_text}</p>
            </div>
          </div>
        )}

        {change.type === 'ADDED' && (
          <div style={styles.newBox}>
            <span style={styles.newLabel}>Added</span>
            <p style={styles.text}>{change.new_text}</p>
          </div>
        )}

        {change.type === 'REMOVED' && (
          <div style={styles.oldBox}>
            <span style={styles.oldLabel}>Removed</span>
            <p style={styles.text}>{change.old_text}</p>
          </div>
        )}
      </div>

      <div style={styles.footer}>Page {change.page + 1}</div>
    </div>
  );
}

const styles = {
  tooltip: {
    position: 'fixed', zIndex: 200,
    background: '#fff', border: '0.5px solid #e0e0e0',
    borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
    padding: '12px', maxWidth: 420, minWidth: 260,
  },
  header: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 },
  close: { marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#aaa', fontSize: 14 },
  content: {},
  compare: { display: 'flex', gap: 8, alignItems: 'flex-start' },
  arrow: { fontSize: 18, color: '#888', paddingTop: 18 },
  oldBox: { flex: 1, background: '#fff5f5', borderRadius: 6, padding: '8px 10px' },
  newBox: { flex: 1, background: '#f0fdf4', borderRadius: 6, padding: '8px 10px' },
  oldLabel: { fontSize: 10, fontWeight: 600, color: '#ef4444', textTransform: 'uppercase', display: 'block', marginBottom: 4 },
  newLabel: { fontSize: 10, fontWeight: 600, color: '#22c55e', textTransform: 'uppercase', display: 'block', marginBottom: 4 },
  text: { fontSize: 13, color: '#1a1a1a', lineHeight: 1.5, margin: 0 },
  footer: { fontSize: 11, color: '#aaa', marginTop: 8, textAlign: 'right' },
};
