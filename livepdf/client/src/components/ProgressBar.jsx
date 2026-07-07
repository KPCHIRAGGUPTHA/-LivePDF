export default function ProgressBar({ percent, filename }) {
  return (
    <div style={styles.container}>
      <div style={styles.textRow}>
        <span style={styles.filename}>{filename}</span>
        <span style={styles.percent}>{percent}%</span>
      </div>
      <div style={styles.track}>
        <div style={{ ...styles.bar, width: `${percent}%` }} />
      </div>
    </div>
  );
}

const styles = {
  container: {
    margin: '1.5rem 0',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    background: '#fff',
    padding: '12px',
    borderRadius: '8px',
    border: '0.5px solid #e0e0e0',
  },
  textRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '13px',
    color: '#555',
  },
  filename: {
    fontWeight: 500,
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    maxWidth: '80%',
  },
  percent: {
    fontWeight: 600,
    color: '#1a1a1a',
  },
  track: {
    background: '#f0f0ed',
    borderRadius: '4px',
    height: '8px',
    width: '100%',
    overflow: 'hidden',
  },
  bar: {
    background: '#1a1a1a',
    height: '100%',
    borderRadius: '4px',
    transition: 'width 0.2s ease-out',
  },
};
