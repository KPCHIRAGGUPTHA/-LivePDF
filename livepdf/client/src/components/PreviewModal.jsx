import PdfViewer from './PdfViewer';

export default function PreviewModal({ document: doc, signedUrl, onClose, onRetry }) {
  if (!doc) return null;

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <button
          style={styles.closeBtn}
          onClick={onClose}
          title="Close Preview"
        >
          ✕
        </button>
        <div style={styles.viewerWrap}>
          <PdfViewer
            url={signedUrl}
            title={doc.title}
            allowDownload={true}
            onRetry={onRetry}
          />
        </div>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(15, 23, 42, 0.4)', // slate-900 transparent overlay
    backdropFilter: 'blur(6px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    animation: 'fadeIn 0.25s ease-out',
  },
  modal: {
    background: '#fff',
    borderRadius: 16,
    width: '90vw',
    height: '85vh',
    maxWidth: 1000,
    position: 'relative',
    overflow: 'hidden',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
    display: 'flex',
    flexDirection: 'column',
    border: '0.5px solid #e2e8f0',
  },
  closeBtn: {
    position: 'absolute',
    top: 14,
    right: 14,
    zIndex: 60,
    width: 32,
    height: 32,
    borderRadius: '50%',
    border: '0.5px solid #e2e8f0',
    background: '#fff',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
    cursor: 'pointer',
    fontSize: 14,
    color: '#64748b',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.15s ease',
    outline: 'none',
  },
  viewerWrap: {
    flex: 1,
    height: '100%',
  },
};
