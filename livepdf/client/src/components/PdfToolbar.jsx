import { useState } from 'react';
import SearchBar from './SearchBar';
import api from '../utils/api';

export default function PdfToolbar({
  pageNumber,
  numPages,
  scale,
  title,
  url,
  allowDownload,
  token,
  continuousScroll,
  onToggleLayout,
  onPrevPage,
  onNextPage,
  onGoToPage,
  onZoomIn,
  onZoomOut,
  onFitWidth,
  onFullscreen,
  searchQuery,
  onSearchChange,
  matchCount,
  currentMatchIndex,
  onNextMatch,
  onPrevMatch,
  isMobile,
  diffReady,
  showDiffPanel,
  onToggleDiffPanel
}) {
  const [downloading, setDownloading] = useState(false);

  // Hover states for buttons
  const [hovers, setHovers] = useState({});

  const setHover = (key, value) => {
    setHovers(prev => ({ ...prev, [key]: value }));
  };

  async function handleDownload() {
    if (downloading) return;
    setDownloading(true);
    try {
      if (token) {
        await api.post(`/share/${token}/download`).catch(err => {
          console.error('Failed to log download audit:', err);
        });
      }
      const res = await fetch(url);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `${title || 'document'}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.error('Download error:', err);
      alert('Failed to download document. The link may have expired.');
    } finally {
      setDownloading(false);
    }
  }

  // Page input validation & submit
  const [inputValue, setInputValue] = useState(pageNumber);

  // Sync input value with pageNumber when it changes externally
  if (inputValue !== pageNumber && document.activeElement?.id !== 'toolbar-page-input') {
    setInputValue(pageNumber);
  }

  const handlePageInputChange = (e) => {
    setInputValue(e.target.value);
  };

  const handlePageInputKeyDown = (e) => {
    if (e.key === 'Enter') {
      let val = parseInt(inputValue, 10);
      if (isNaN(val) || val < 1) {
        val = 1;
      } else if (numPages && val > numPages) {
        val = numPages;
      }
      onGoToPage(val);
      setInputValue(val);
      e.target.blur();
    }
  };

  return (
    <div style={styles.toolbar}>
      {/* Title */}
      <span style={styles.title} title={title}>{title || 'Document'}</span>

      <div style={styles.controlsGroup}>
        {/* Navigation Group */}
        <div style={styles.group}>
          <button
            style={{
              ...styles.btn,
              ...(hovers.prev ? styles.btnHover : {}),
              opacity: pageNumber <= 1 ? 0.4 : 1
            }}
            onClick={onPrevPage}
            disabled={pageNumber <= 1}
            onMouseEnter={() => setHover('prev', true)}
            onMouseLeave={() => setHover('prev', false)}
            title="Previous Page"
          >
            ‹
          </button>
          <input
            id="toolbar-page-input"
            style={styles.pageInput}
            type="text"
            value={inputValue}
            onChange={handlePageInputChange}
            onKeyDown={handlePageInputKeyDown}
            title="Type page number and press Enter"
          />
          <span style={styles.pageTotal}>/ {numPages || '–'}</span>
          <button
            style={{
              ...styles.btn,
              ...(hovers.next ? styles.btnHover : {}),
              opacity: (numPages && pageNumber >= numPages) ? 0.4 : 1
            }}
            onClick={onNextPage}
            disabled={numPages ? pageNumber >= numPages : false}
            onMouseEnter={() => setHover('next', true)}
            onMouseLeave={() => setHover('next', false)}
            title="Next Page"
          >
            ›
          </button>
        </div>

        <div style={styles.divider} />

        {/* Zoom Group */}
        <div style={styles.group}>
          <button
            style={{
              ...styles.btn,
              ...(hovers.zoomOut ? styles.btnHover : {}),
              opacity: scale <= 0.5 ? 0.4 : 1
            }}
            onClick={onZoomOut}
            disabled={scale <= 0.5}
            onMouseEnter={() => setHover('zoomOut', true)}
            onMouseLeave={() => setHover('zoomOut', false)}
            title="Zoom Out"
          >
            −
          </button>
          <span style={styles.zoomLabel}>{Math.round(scale * 100)}%</span>
          <button
            style={{
              ...styles.btn,
              ...(hovers.zoomIn ? styles.btnHover : {}),
              opacity: scale >= 2.0 ? 0.4 : 1
            }}
            onClick={onZoomIn}
            disabled={scale >= 2.0}
            onMouseEnter={() => setHover('zoomIn', true)}
            onMouseLeave={() => setHover('zoomIn', false)}
            title="Zoom In"
          >
            +
          </button>
          {!isMobile && (
            <button
              style={{
                ...styles.btnSmall,
                ...(hovers.fit ? styles.btnHover : {})
              }}
              onClick={onFitWidth}
              onMouseEnter={() => setHover('fit', true)}
              onMouseLeave={() => setHover('fit', false)}
              title="Fit to Container Width"
            >
              Fit
            </button>
          )}
        </div>

        <div style={styles.divider} />

        {/* Layout Toggle Group */}
        <div style={styles.group}>
          <button
            style={{
              ...styles.btnSmall,
              ...(hovers.layout ? styles.btnHover : {}),
              background: continuousScroll ? '#f0f0ed' : '#fff',
              fontWeight: continuousScroll ? '600' : 'normal',
            }}
            onClick={onToggleLayout}
            onMouseEnter={() => setHover('layout', true)}
            onMouseLeave={() => setHover('layout', false)}
            title={continuousScroll ? "Switch to Single Page Mode" : "Switch to Continuous Scroll Mode"}
          >
            {continuousScroll ? '📖 Scroll' : '📄 Single'}
          </button>
        </div>

        <div style={styles.divider} />

        {/* Search Component */}
        <SearchBar
          query={searchQuery}
          onChange={onSearchChange}
          matchCount={matchCount}
          currentIndex={currentMatchIndex}
          onNext={onNextMatch}
          onPrev={onPrevMatch}
        />

        {/* Action Group */}
        <div style={{ ...styles.group, marginLeft: 'auto' }}>
          {diffReady && (
            <button
              style={{
                ...styles.btnSmall,
                ...(hovers.diffPanel ? styles.btnHover : {}),
                background: showDiffPanel ? '#f1f5f9' : '#fff',
                fontWeight: showDiffPanel ? '600' : 'normal',
                borderColor: showDiffPanel ? '#94a3b8' : '#cbd5e1',
                color: showDiffPanel ? '#0f172a' : '#334155',
                display: 'flex',
                alignItems: 'center',
                gap: 4
              }}
              onClick={onToggleDiffPanel}
              onMouseEnter={() => setHover('diffPanel', true)}
              onMouseLeave={() => setHover('diffPanel', false)}
              title={showDiffPanel ? "Hide Changes Panel" : "Show Changes Panel"}
            >
              ⚖️ Diffs
            </button>
          )}
          {allowDownload && (
            <button
              style={{
                ...styles.btnPrimary,
                ...(hovers.download ? styles.btnPrimaryHover : {}),
                opacity: downloading ? 0.7 : 1
              }}
              onClick={handleDownload}
              disabled={downloading}
              onMouseEnter={() => setHover('download', true)}
              onMouseLeave={() => setHover('download', false)}
              title="Download PDF"
            >
              {downloading ? 'Downloading...' : '📥 Download'}
            </button>
          )}
          {!isMobile && (
            <button
              style={{
                ...styles.btnSmall,
                ...(hovers.fullscreen ? styles.btnHover : {})
              }}
              onClick={onFullscreen}
              onMouseEnter={() => setHover('fullscreen', true)}
              onMouseLeave={() => setHover('fullscreen', false)}
              title="Toggle Fullscreen"
            >
              ⛶
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const styles = {
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    padding: '10px 20px',
    background: 'rgba(255, 255, 255, 0.85)',
    backdropFilter: 'blur(12px)',
    borderBottom: '0.5px solid #e2e8f0',
    flexWrap: 'wrap',
    boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px -1px rgba(0, 0, 0, 0.03)',
    zIndex: 50,
  },
  title: {
    fontSize: 14,
    fontWeight: 600,
    color: '#0f172a',
    maxWidth: 240,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    userSelect: 'none',
  },
  controlsGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
    flex: 1,
  },
  group: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  divider: {
    width: '0.5px',
    height: 20,
    background: '#cbd5e1',
  },
  btn: {
    width: 30,
    height: 30,
    border: '0.5px solid #cbd5e1',
    borderRadius: 8,
    background: '#fff',
    cursor: 'pointer',
    fontSize: 15,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.15s ease',
    color: '#334155',
    outline: 'none',
  },
  btnSmall: {
    padding: '0 12px',
    height: 30,
    border: '0.5px solid #cbd5e1',
    borderRadius: 8,
    background: '#fff',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 500,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.15s ease',
    color: '#334155',
    outline: 'none',
  },
  btnHover: {
    borderColor: '#94a3b8',
    background: '#f8fafc',
    color: '#0f172a',
  },
  btnPrimary: {
    padding: '0 14px',
    height: 30,
    borderRadius: 8,
    background: '#0f172a',
    color: '#fff',
    border: 'none',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    transition: 'all 0.15s ease',
    outline: 'none',
  },
  btnPrimaryHover: {
    background: '#1e293b',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
  },
  pageInput: {
    width: 44,
    height: 30,
    textAlign: 'center',
    border: '0.5px solid #cbd5e1',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
    color: '#0f172a',
    outline: 'none',
    transition: 'all 0.2s ease',
  },
  pageTotal: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: 500,
    marginLeft: 2,
    marginRight: 4,
    userSelect: 'none',
  },
  zoomLabel: {
    fontSize: 13,
    fontWeight: 600,
    color: '#334155',
    minWidth: 44,
    textAlign: 'center',
    userSelect: 'none',
  },
};
