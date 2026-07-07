import { formatFileSize, timeAgo } from '../utils/formatters';
import { useState } from 'react';
import api from '../utils/api';
import PreviewModal from './PreviewModal';

export default function DocumentCard({ doc, onReplace, onDelete, onShare, onHistory }) {
  const [isDeleteHovered, setIsDeleteHovered] = useState(false);
  const [isReplaceHovered, setIsReplaceHovered] = useState(false);
  const [isShareHovered, setIsShareHovered] = useState(false);
  const [isPreviewHovered, setIsPreviewHovered] = useState(false);
  const [isHistoryHovered, setIsHistoryHovered] = useState(false);
  const [viewLoading, setViewLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Preview states
  const [showPreview, setShowPreview] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);

  const handleView = async () => {
    if (viewLoading) return;
    setViewLoading(true);
    try {
      const res = await api.get(`/documents/${doc.id}/signed-url`);
      const url = res.data.url || res.data.signedUrl;
      window.open(url, '_blank');
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to open document');
    } finally {
      setViewLoading(false);
    }
  };

  const handlePreview = async () => {
    if (previewLoading) return;
    setPreviewLoading(true);
    try {
      const res = await api.get(`/documents/${doc.id}/signed-url`);
      const url = res.data.url || res.data.signedUrl;
      setPreviewUrl(url);
      setShowPreview(true);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to generate preview URL');
    } finally {
      setPreviewLoading(false);
    }
  };

  if (confirmDelete) {
    return (
      <div style={{ ...styles.card, border: '0.5px solid #fca5a5', background: '#fffcfc' }}>
        <div style={styles.confirmWrapper}>
          <span style={styles.confirmIcon}>⚠️</span>
          <span style={styles.confirmTitle}>Delete this document?</span>
          <p style={styles.confirmText}>This will permanently delete all versions from storage.</p>
        </div>
        <div style={styles.actions}>
          <button
            style={styles.btn}
            onClick={() => setConfirmDelete(false)}
          >
            Cancel
          </button>
          <button
            style={{ ...styles.btn, ...styles.btnDelete }}
            onClick={() => onDelete(doc.id)}
          >
            Delete
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.card}>
      <div style={styles.topRow}>
        <div style={styles.titleContainer} onClick={handlePreview} title="Click to preview PDF">
          <span style={styles.icon}>📄</span>
          <span style={styles.title}>{doc.title}</span>
        </div>
        <span style={styles.badge}>v{doc.version_number}</span>
      </div>

      <div style={styles.metaRow}>
        <span style={styles.metaItem}>{formatFileSize(doc.file_size)}</span>
        <span style={styles.dot}>•</span>
        <span style={styles.metaItem}>{timeAgo(doc.uploaded_at)}</span>
      </div>

      <div style={styles.actions}>
        <button
          style={{ ...styles.btn, ...(isPreviewHovered ? styles.btnPreviewHover : {}) }}
          onMouseEnter={() => setIsPreviewHovered(true)}
          onMouseLeave={() => setIsPreviewHovered(false)}
          onClick={handlePreview}
          disabled={previewLoading}
        >
          👁️ {previewLoading ? '...' : 'Preview'}
        </button>
        <button
          style={{ ...styles.btn, ...(isShareHovered ? styles.btnShareHover : {}) }}
          onMouseEnter={() => setIsShareHovered(true)}
          onMouseLeave={() => setIsShareHovered(false)}
          onClick={() => onShare && onShare(doc)}
        >
          🔗 Share
        </button>
        <button
          style={{ ...styles.btn, ...(isReplaceHovered ? styles.btnReplaceHover : {}) }}
          onMouseEnter={() => setIsReplaceHovered(true)}
          onMouseLeave={() => setIsReplaceHovered(false)}
          onClick={() => onReplace(doc)}
        >
          🔄 Replace
        </button>
        <button
          style={{ ...styles.btn, ...(isHistoryHovered ? styles.btnHistoryHover : {}) }}
          onMouseEnter={() => setIsHistoryHovered(true)}
          onMouseLeave={() => setIsHistoryHovered(false)}
          onClick={() => onHistory && onHistory(doc)}
        >
          🕒 History
        </button>
        <button
          style={{ ...styles.btn, ...styles.btnDelete, ...(isDeleteHovered ? styles.btnDeleteHover : {}) }}
          onMouseEnter={() => setIsDeleteHovered(true)}
          onMouseLeave={() => setIsDeleteHovered(false)}
          onClick={() => setConfirmDelete(true)}
        >
          🗑️ Delete
        </button>
      </div>

      {showPreview && (
        <PreviewModal
          document={doc}
          signedUrl={previewUrl}
          onClose={() => setShowPreview(false)}
          onRetry={handlePreview}
        />
      )}
    </div>
  );
}

const styles = {
  card: {
    background: '#fff',
    borderRadius: '12px',
    border: '0.5px solid #e0e0e0',
    padding: '1.5rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.01)',
    transition: 'transform 0.2s, box-shadow 0.2s',
  },
  confirmWrapper: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    textAlign: 'center',
    padding: '8px 0',
  },
  confirmIcon: {
    fontSize: '22px',
  },
  confirmTitle: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#b91c1c',
  },
  confirmText: {
    margin: 0,
    fontSize: '12px',
    color: '#666',
    lineHeight: '1.4',
  },
  topRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '8px',
  },
  titleContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    cursor: 'pointer',
    flex: 1,
    overflow: 'hidden',
  },
  icon: {
    fontSize: '20px',
    flexShrink: 0,
  },
  title: {
    fontSize: '15px',
    fontWeight: 600,
    color: '#1a1a1a',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  badge: {
    background: '#f0f0ed',
    color: '#555',
    fontSize: '11px',
    fontWeight: 600,
    padding: '2px 8px',
    borderRadius: '12px',
    flexShrink: 0,
  },
  metaRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '12px',
    color: '#888',
  },
  dot: {
    color: '#ccc',
  },
  metaItem: {
    whiteSpace: 'nowrap',
  },
  actions: {
    display: 'flex',
    gap: '8px',
    marginTop: '8px',
    borderTop: '0.5px solid #f0f0ed',
    paddingTop: '12px',
  },
  btn: {
    flex: 1,
    padding: '6px 8px',
    borderRadius: '6px',
    background: '#fff',
    border: '0.5px solid #d0d0d0',
    color: '#444',
    fontSize: '12px',
    fontWeight: 500,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '4px',
    transition: 'all 0.15s ease',
  },
  btnShareHover: {
    background: '#fafafa',
    border: '0.5px solid #999',
    color: '#1a1a1a',
  },
  btnReplaceHover: {
    background: '#fafafa',
    border: '0.5px solid #999',
    color: '#1a1a1a',
  },
  btnPreviewHover: {
    background: '#fafafa',
    border: '0.5px solid #999',
    color: '#1a1a1a',
  },
  btnHistoryHover: {
    background: '#fafafa',
    border: '0.5px solid #999',
    color: '#1a1a1a',
  },
  btnDelete: {
    color: '#b91c1c',
    border: '0.5px solid #fca5a5',
  },
  btnDeleteHover: {
    background: '#fff0f0',
    border: '0.5px solid #b91c1c',
  },
};
