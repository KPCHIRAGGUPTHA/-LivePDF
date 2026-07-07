export default function ConnectionStatus({ connected, reconnecting }) {
  const label = reconnecting
    ? 'Reconnecting…'
    : connected
      ? 'Live'
      : 'Disconnected';

  const color = reconnecting
    ? '#f59e0b'   // amber
    : connected
      ? '#22c55e'   // green
      : '#ef4444';  // red

  return (
    <div style={styles.wrap} title={label}>
      <div style={{ ...styles.dot, background: color }} />
      <span style={styles.label}>{label}</span>
    </div>
  );
}

const styles = {
  wrap: { display: 'flex', alignItems: 'center', gap: 5, cursor: 'default' },
  dot: { width: 7, height: 7, borderRadius: '50%' },
  label: { fontSize: 11, color: '#888' },
};
