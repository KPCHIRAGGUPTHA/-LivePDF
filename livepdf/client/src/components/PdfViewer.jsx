import { useState, useRef, useCallback, useEffect } from 'react';
import { Document, Page } from 'react-pdf';
import PdfToolbar from './PdfToolbar';
import usePdfSearch from '../hooks/usePdfSearch';
import DiffOverlay from './DiffOverlay';
import DiffPanel from './DiffPanel';
import useDiff from '../hooks/useDiff';
import WatermarkOverlay from './WatermarkOverlay';
import { useAuth } from '../context/AuthContext';

// Import react-pdf styles for correct text-layer absolute positioning and overlay
import 'react-pdf/dist/Page/TextLayer.css';

export default function PdfViewer({ url, title, allowDownload, showWatermark, onRetry, socket, initialDiff, token, isMobile: isMobileProp }) {
  const [numPages, setNumPages] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1.0);
  const [continuousScroll, setContinuousScroll] = useState(true);
  const [status, setStatus] = useState('loading'); // loading | success | error | empty
  const [containerWidth, setContainerWidth] = useState(null);
  const [pdfDoc, setPdfDoc] = useState(null);
  const [pageDimensions, setPageDimensions] = useState({});

  const { user } = useAuth();
  const viewerEmail = user ? user.email : 'Shared via LivePDF';

  const [showDiffPanel, setShowDiffPanel] = useState(false);
  const [pageHeight, setPageHeight] = useState(792); // default Letter height in pts

  const { changeMap, diffStats, diffReady, summary, summaryLoading, getChangesForPage } = useDiff(socket, initialDiff);

  const containerRef = useRef(null);
  const pageAreaRef = useRef(null);
  const pageRefs = useRef({});
  const isFirstLoad = useRef(true);

  const {
    searchQuery,
    setSearchQuery,
    matches,
    currentMatch,
    goToNextMatch,
    goToPrevMatch,
    isSearching
  } = usePdfSearch(pdfDoc);

  // Reset states when the signed URL changes/refreshes
  useEffect(() => {
    setStatus('loading');
    setNumPages(null);
    setPdfDoc(null);
  }, [url]);

  // Track container width for "fit to width" and responsive sizing
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(entries => {
      if (entries[0]) {
        setContainerWidth(entries[0].contentRect.width);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Jump to active search match's page and scroll to it
  useEffect(() => {
    if (matches.length > 0 && matches[currentMatch]) {
      const matchPage = matches[currentMatch].pageNumber;
      goToPage(matchPage, true);
    }
  }, [currentMatch, matches]);

  const goToPage = useCallback((n, shouldScroll = true) => {
    if (!numPages || n < 1 || n > numPages) return;
    setPageNumber(n);

    if (shouldScroll && continuousScroll && pageRefs.current[n]) {
      pageRefs.current[n].scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [numPages, continuousScroll]);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKey(e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      if (e.key === 'ArrowRight') {
        e.preventDefault();
        goToPage(pageNumber + 1, true);
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goToPage(pageNumber - 1, true);
      }
      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        setScale(s => Math.min(2.0, s + 0.1));
      }
      if (e.key === '-') {
        e.preventDefault();
        setScale(s => Math.max(0.5, s - 0.1));
      }
      if (e.key === '/') {
        e.preventDefault();
        document.getElementById('pdf-search-input')?.focus();
      }
      if (e.key === 'Escape' && document.fullscreenElement) {
        document.exitFullscreen();
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [pageNumber, numPages, goToPage]);

  function onLoadSuccess(pdf) {
    setPdfDoc(pdf);
    setNumPages(pdf.numPages);
    
    if (isFirstLoad.current) {
      isFirstLoad.current = false;
      setStatus(pdf.numPages > 0 ? 'success' : 'empty');
    } else {
      setPageNumber(prev => Math.min(prev, pdf.numPages));
      setStatus(pdf.numPages > 0 ? 'success' : 'empty');
    }
  }

  function onLoadError(err) {
    console.error('PDF.js load error:', err);
    setStatus('error');
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(err => {
        console.error('Fullscreen API failed:', err);
      });
    } else {
      document.exitFullscreen();
    }
  }

  function fitToWidth() {
    if (!containerWidth) return;
    // Standard PDF page width (points)
    const PAGE_NATIVE_WIDTH = 612;
    // Subtract some padding/margins
    const padding = 40;
    const availableWidth = containerWidth - padding;
    setScale(Math.max(0.5, Math.min(2.0, availableWidth / PAGE_NATIVE_WIDTH)));
  }

  const handleToggleLayout = () => {
    setContinuousScroll(prev => !prev);
    // When switching layout, reset scroll position if page area exists
    if (pageAreaRef.current) {
      pageAreaRef.current.scrollTop = 0;
    }
  };

  // Scroll spy for continuous scroll mode
  const handleScroll = () => {
    if (!continuousScroll || !numPages) return;
    const pageArea = pageAreaRef.current;
    if (!pageArea) return;

    const scrollTop = pageArea.scrollTop;
    let closestPage = 1;
    let minDiff = Infinity;

    for (let p = 1; p <= numPages; p++) {
      const el = pageRefs.current[p];
      if (!el) continue;
      const diff = Math.abs(el.offsetTop - scrollTop - 16); // offset by margin
      if (diff < minDiff) {
        minDiff = diff;
        closestPage = p;
      }
    }

    if (closestPage !== pageNumber) {
      // Set page number without triggering scrollIntoView recursive loops
      setPageNumber(closestPage);
    }
  };

  const isMobile = isMobileProp || (containerWidth && containerWidth < 480);

  // Render individual page with its highlighting overlay
  const renderSinglePage = (pageNum) => {
    const pageMatches = matches.filter(m => m.pageNumber === pageNum);

    return (
      <div
        ref={el => { pageRefs.current[pageNum] = el; }}
        key={pageNum}
        style={styles.pageCard}
      >
        <div style={{ position: 'relative', display: 'inline-block' }}>
          <Page
            pageNumber={pageNum}
            scale={scale}
            renderTextLayer={true}
            renderAnnotationLayer={false}
            onRenderSuccess={(page) => {
              setPageHeight(page.height / scale);
              setPageDimensions(prev => ({
                ...prev,
                [pageNum]: { width: page.width, height: page.height }
              }));
            }}
            loading={<div style={styles.pageLoading}>Loading page {pageNum}...</div>}
          />
          {showWatermark && pageDimensions[pageNum] && (
            <WatermarkOverlay
              email={viewerEmail}
              width={pageDimensions[pageNum].width}
              height={pageDimensions[pageNum].height}
            />
          )}
          {/* Highlights overlay */}
          {pageMatches.length > 0 && (
            <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 10 }}>
              {pageMatches.map((match, idx) => {
                const globalIdx = matches.indexOf(match);
                const isCurrent = globalIdx === currentMatch;
                return (
                  <div
                    key={idx}
                    style={{
                      position: 'absolute',
                      left: match.x * scale,
                      top: match.y * scale,
                      width: match.w * scale,
                      height: match.h * scale,
                      backgroundColor: isCurrent ? 'rgba(234, 179, 8, 0.45)' : 'rgba(254, 240, 138, 0.6)',
                      border: isCurrent ? '1.5px solid #d97706' : '0.5px dashed #f59e0b',
                      borderRadius: 2,
                      boxSizing: 'border-box',
                      pointerEvents: 'none',
                    }}
                  />
                );
              })}
            </div>
          )}
          {diffReady && (
            <DiffOverlay
              changes={getChangesForPage(pageNum - 1)}
              scale={scale}
              pageHeight={pageHeight}
            />
          )}
        </div>
      </div>
    );
  };

  if (status === 'error') {
    return (
      <div style={styles.center}>
        <div style={styles.errorIcon}>⚠️</div>
        <p style={styles.errorText}>Could not load this document.</p>
        <p style={styles.errorSub}>The signed link may have expired or is invalid.</p>
        <button
          style={styles.retryBtn}
          onClick={onRetry || (() => window.location.reload())}
        >
          🔄 Refresh & Retry
        </button>
      </div>
    );
  }

  return (
    <div ref={containerRef} style={styles.container}>
      <PdfToolbar
        pageNumber={pageNumber}
        numPages={numPages}
        scale={scale}
        title={title}
        url={url}
        allowDownload={allowDownload}
        token={token}
        continuousScroll={continuousScroll}
        onToggleLayout={handleToggleLayout}
        onPrevPage={() => goToPage(pageNumber - 1, true)}
        onNextPage={() => goToPage(pageNumber + 1, true)}
        onGoToPage={goToPage}
        onZoomIn={() => setScale(s => Math.min(2.0, s + 0.1))}
        onZoomOut={() => setScale(s => Math.max(0.5, s - 0.1))}
        onFitWidth={fitToWidth}
        onFullscreen={toggleFullscreen}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        matchCount={matches.length}
        currentMatchIndex={currentMatch}
        onNextMatch={goToNextMatch}
        onPrevMatch={goToPrevMatch}
        isMobile={isMobile}
        diffReady={diffReady}
        showDiffPanel={showDiffPanel}
        onToggleDiffPanel={() => setShowDiffPanel(prev => !prev)}
      />

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative', width: '100%' }}>
        <div
          ref={pageAreaRef}
          style={styles.pageArea}
          onScroll={handleScroll}
        >
          {status === 'loading' && (
            <div style={styles.loaderContainer}>
              <div style={styles.spinner} />
              <p style={styles.loadingText}>Loading document...</p>
            </div>
          )}
          {status === 'empty' && (
            <div style={styles.loaderContainer}>
              <p style={styles.loadingText}>This document appears to be empty.</p>
            </div>
          )}

          <Document
            file={url}
            onLoadSuccess={onLoadSuccess}
            onLoadError={onLoadError}
            loading={null}
          >
            {status === 'success' && (
              continuousScroll ? (
                <div style={styles.scrollContainer}>
                  {Array.from({ length: numPages }, (_, i) => renderSinglePage(i + 1))}
                </div>
              ) : (
                renderSinglePage(pageNumber)
              )
            )}
          </Document>
        </div>

        {diffReady && (
          <DiffPanel
            changeMap={changeMap}
            diffStats={diffStats}
            summary={summary}
            summaryLoading={summaryLoading}
            visible={showDiffPanel}
            onChangeClick={(change) => {
              goToPage(change.page + 1, true);
            }}
            token={token}
            onPageClick={(page) => {
              goToPage(page, true);
            }}
          />
        )}
      </div>

      {/* CSS injection for Spinner keyframes */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}} />
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    background: '#f1f5f9',
    position: 'relative',
    overflow: 'hidden',
  },
  pageArea: {
    flex: 1,
    overflow: 'auto',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '24px 16px',
    position: 'relative',
    scrollBehavior: 'smooth',
  },
  scrollContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 20,
    width: '100%',
  },
  pageCard: {
    background: '#fff',
    borderRadius: 8,
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)',
    padding: 8,
    border: '0.5px solid #e2e8f0',
    transition: 'transform 0.2s ease',
  },
  pageLoading: {
    padding: '40px 100px',
    color: '#64748b',
    fontSize: 14,
    fontWeight: 500,
  },
  loaderContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: '10%',
    gap: 12,
  },
  spinner: {
    width: 32,
    height: 32,
    border: '3px solid #e2e8f0',
    borderTop: '3px solid #0f172a',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  loadingText: {
    color: '#475569',
    fontSize: 14,
    fontWeight: 500,
    margin: 0,
  },
  center: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    minHeight: 400,
    padding: '32px',
    textAlign: 'center',
    background: '#f8fafc',
    borderRadius: 12,
    border: '0.5px dashed #cbd5e1',
  },
  errorIcon: {
    fontSize: 40,
    marginBottom: 12,
  },
  errorText: {
    fontSize: 16,
    fontWeight: 600,
    color: '#dc2626',
    margin: '0 0 6px 0',
  },
  errorSub: {
    fontSize: 13,
    color: '#64748b',
    margin: '0 0 16px 0',
  },
  retryBtn: {
    padding: '8px 16px',
    background: '#0f172a',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
    transition: 'background 0.2s ease',
  },
};
