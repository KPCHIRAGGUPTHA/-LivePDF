const TYPE_STYLES = {
  ADDED:    { bg: '#f0fdf4', color: '#15803d', label: 'Added' },
  REMOVED:  { bg: '#fff5f5', color: '#b91c1c', label: 'Removed' },
  MODIFIED: { bg: '#fffbeb', color: '#b45309', label: 'Modified' },
};

const IMPORTANCE_STYLES = {
  Low:      { bg: '#f5f5f5', color: '#888', label: 'Low' },
  High:     { bg: '#fff7ed', color: '#c2410c', label: 'High' },
  Critical: { bg: '#fef2f2', color: '#b91c1c', label: '⚠ Critical' },
};

export default function ChangeBadge({ type, importance }) {
  const style = type
    ? TYPE_STYLES[type]
    : IMPORTANCE_STYLES[importance];

  if (!style) return null;

  return (
    <span style={{
      fontSize: 11, fontWeight: 600, padding: '2px 8px',
      borderRadius: 20, background: style.bg, color: style.color,
      display: 'inline-block',
    }}>
      {style.label}
    </span>
  );
}
