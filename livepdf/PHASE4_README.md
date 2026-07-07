# LivePDF — Phase 4: PDF Viewer

## What Phase 4 adds

Phase 4 replaces the basic `<iframe>` used in Phase 3's Viewer page with a proper,
custom-built PDF viewer using PDF.js and react-pdf. You get full control over
zoom, page navigation, full-screen mode, text search, and downloads — and this
same viewer becomes the foundation for Phase 6's diff highlighting.

---

## Prerequisites

- Phase 1, 2, and 3 fully working
- Phase 3's Viewer.jsx exists (we will replace its iframe)
- Phase 2's signed URL endpoint working (the viewer needs a valid signed S3 URL)

---

## Step 1 — Install new dependencies

```bash
cd client
npm install react-pdf
```

react-pdf pulls in `pdfjs-dist` automatically. No backend changes are needed —
Phase 4 is 100% frontend.

---

## Step 2 — Configure the PDF.js worker

react-pdf needs a "worker" file to parse PDFs off the main thread (so the UI
doesn't freeze on large files). You configure this once, globally.

Create `client/src/utils/pdfWorker.js`:

```js
import { pdfjs } from 'react-pdf';

// Use the CDN-hosted worker matching the installed pdfjs-dist version
pdfjs.GlobalWorkerOptions.workerSrc =
  `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;
```

Import this once in `main.jsx`:

```jsx
import './utils/pdfWorker';
```

---

## Step 3 — New files to create

```
client/src/
├── components/
│   ├── PdfViewer.jsx           ← NEW — the core reusable viewer
│   ├── PdfToolbar.jsx          ← NEW — page nav, zoom, search, fullscreen, download
│   ├── SearchBar.jsx           ← NEW — text search UI
│   └── PreviewModal.jsx        ← NEW — dashboard "Preview" popup
├── hooks/
│   └── usePdfSearch.js         ← NEW — search logic across all pages
├── pages/
│   └── Viewer.jsx              ← UPDATED — replace iframe with PdfViewer
└── utils/
    └── pdfWorker.js            ← NEW — PDF.js worker config
```

---

## Step 4 — Code walkthrough

### PdfViewer.jsx — the core component

This is the reusable viewer used by both the public Viewer page and the
dashboard preview modal.

```jsx
import { useState, useRef, useCallback, useEffect } from 'react';
import { Document, Page } from 'react-pdf';
import PdfToolbar from './PdfToolbar';
import usePdfSearch from '../hooks/usePdfSearch';

export default function PdfViewer({ url, title, allowDownload }) {
  const [numPages, setNumPages] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1.0);
  const [status, setStatus] = useState('loading'); // loading | success | error | empty
  const [containerWidth, setContainerWidth] = useState(null);

  const containerRef = useRef(null);
  const { searchQuery, setSearchQuery, matches, currentMatch, goToNextMatch, goToPrevMatch } =
    usePdfSearch(numPages);

  // Track container width for "fit to width"
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(entries => {
      setContainerWidth(entries[0].contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKey(e) {
      if (e.target.tagName === 'INPUT') return; // don't hijack typing
      if (e.key === 'ArrowRight') goToPage(pageNumber + 1);
      if (e.key === 'ArrowLeft') goToPage(pageNumber - 1);
      if (e.key === '+' || e.key === '=') setScale(s => Math.min(2.0, s + 0.1));
      if (e.key === '-') setScale(s => Math.max(0.5, s - 0.1));
      if (e.key === 'Escape' && document.fullscreenElement) document.exitFullscreen();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [pageNumber]);

  function onLoadSuccess({ numPages }) {
    setNumPages(numPages);
    setStatus(numPages > 0 ? 'success' : 'empty');
  }

  function onLoadError() {
    setStatus('error');
  }

  function goToPage(n) {
    if (n < 1 || n > numPages) return;
    setPageNumber(n);
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  }

  function fitToWidth() {
    if (!containerWidth) return;
    // 612pt is the default Letter-size PDF width in points
    const PAGE_NATIVE_WIDTH = 612;
    setScale(containerWidth / PAGE_NATIVE_WIDTH);
  }

  if (status === 'error') {
    return (
      <div style={styles.center}>
        <p style={styles.errorText}>Could not load this document.</p>
        <p style={styles.errorSub}>The link may have expired. Try refreshing the page.</p>
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
        onPrevPage={() => goToPage(pageNumber - 1)}
        onNextPage={() => goToPage(pageNumber + 1)}
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
      />

      <div style={styles.pageArea}>
        {status === 'loading' && <p style={styles.loadingText}>Loading document…</p>}
        {status === 'empty' && <p style={styles.loadingText}>This document appears to be empty.</p>}

        <Document
          file={url}
          onLoadSuccess={onLoadSuccess}
          onLoadError={onLoadError}
          loading={null}
        >
          <Page
            pageNumber={pageNumber}
            scale={scale}
            renderTextLayer={true}
            renderAnnotationLayer={false}
          />
        </Document>
      </div>
    </div>
  );
}

const styles = {
  container: { display: 'flex', flexDirection: 'column', height: '100%', background: '#f0f0f0' },
  pageArea: { flex: 1, overflow: 'auto', display: 'flex', justifyContent: 'center', padding: '1rem' },
  loadingText: { color: '#888', fontSize: 14, marginTop: '2rem' },
  center: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '2rem', textAlign: 'center' },
  errorText: { fontSize: 16, fontWeight: 500, color: '#b91c1c' },
  errorSub: { fontSize: 13, color: '#888', marginTop: 6 },
};
```

---

### PdfToolbar.jsx — all the controls

```jsx
import SearchBar from './SearchBar';

export default function PdfToolbar({
  pageNumber, numPages, scale, title, url, allowDownload,
  onPrevPage, onNextPage, onGoToPage,
  onZoomIn, onZoomOut, onFitWidth, onFullscreen,
  searchQuery, onSearchChange, matchCount, currentMatchIndex, onNextMatch, onPrevMatch,
}) {
  async function handleDownload() {
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
  }

  return (
    <div style={styles.toolbar}>
      <span style={styles.title}>{title}</span>

      <div style={styles.group}>
        <button style={styles.btn} onClick={onPrevPage} disabled={pageNumber <= 1}>‹</button>
        <input
          style={styles.pageInput}
          type="number"
          value={pageNumber}
          onChange={e => onGoToPage(Number(e.target.value))}
        />
        <span style={styles.pageTotal}>/ {numPages || '–'}</span>
        <button style={styles.btn} onClick={onNextPage} disabled={pageNumber >= numPages}>›</button>
      </div>

      <div style={styles.group}>
        <button style={styles.btn} onClick={onZoomOut}>−</button>
        <span style={styles.zoomLabel}>{Math.round(scale * 100)}%</span>
        <button style={styles.btn} onClick={onZoomIn}>+</button>
        <button style={styles.btnSmall} onClick={onFitWidth}>Fit</button>
      </div>

      <SearchBar
        query={searchQuery}
        onChange={onSearchChange}
        matchCount={matchCount}
        currentIndex={currentMatchIndex}
        onNext={onNextMatch}
        onPrev={onPrevMatch}
      />

      <div style={styles.group}>
        {allowDownload && (
          <button style={styles.btnSmall} onClick={handleDownload}>Download</button>
        )}
        <button style={styles.btnSmall} onClick={onFullscreen}>⛶</button>
      </div>
    </div>
  );
}

const styles = {
  toolbar: { display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px', background: '#fff', borderBottom: '0.5px solid #e0e0e0', flexWrap: 'wrap' },
  title: { fontSize: 14, fontWeight: 500, color: '#1a1a1a', marginRight: 'auto' },
  group: { display: 'flex', alignItems: 'center', gap: 4 },
  btn: { width: 28, height: 28, border: '0.5px solid #d0d0d0', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: 14 },
  btnSmall: { padding: '5px 10px', border: '0.5px solid #d0d0d0', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: 12 },
  pageInput: { width: 40, textAlign: 'center', border: '0.5px solid #d0d0d0', borderRadius: 6, padding: '4px', fontSize: 13 },
  pageTotal: { fontSize: 13, color: '#888' },
  zoomLabel: { fontSize: 13, color: '#555', minWidth: 40, textAlign: 'center' },
};
```

---

### SearchBar.jsx

```jsx
export default function SearchBar({ query, onChange, matchCount, currentIndex, onNext, onPrev }) {
  return (
    <div style={styles.wrap}>
      <input
        style={styles.input}
        type="text"
        placeholder="Search… (press /)"
        value={query}
        onChange={e => onChange(e.target.value)}
        id="pdf-search-input"
      />
      {query && (
        <>
          <span style={styles.count}>
            {matchCount > 0 ? `${currentIndex + 1} / ${matchCount}` : 'No results'}
          </span>
          <button style={styles.navBtn} onClick={onPrev} disabled={matchCount === 0}>‹</button>
          <button style={styles.navBtn} onClick={onNext} disabled={matchCount === 0}>›</button>
        </>
      )}
    </div>
  );
}

const styles = {
  wrap: { display: 'flex', alignItems: 'center', gap: 4 },
  input: { width: 160, padding: '5px 10px', border: '0.5px solid #d0d0d0', borderRadius: 6, fontSize: 13, outline: 'none' },
  count: { fontSize: 12, color: '#888', whiteSpace: 'nowrap' },
  navBtn: { width: 24, height: 24, border: '0.5px solid #d0d0d0', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: 12 },
};
```

---

### usePdfSearch.js — search hook

This hook tracks the search query and matches. Full cross-page text search
requires accessing each page's text content via PDF.js directly.

```js
import { useState, useCallback } from 'react';

export default function usePdfSearch() {
  const [searchQuery, setSearchQuery] = useState('');
  const [matches, setMatches] = useState([]);   // [{ pageIndex, text }]
  const [currentMatch, setCurrentMatch] = useState(0);

  // Called by the slash key handler in PdfViewer
  const focusSearch = useCallback(() => {
    document.getElementById('pdf-search-input')?.focus();
  }, []);

  function goToNextMatch() {
    if (matches.length === 0) return;
    setCurrentMatch(i => (i + 1) % matches.length);
  }

  function goToPrevMatch() {
    if (matches.length === 0) return;
    setCurrentMatch(i => (i - 1 + matches.length) % matches.length);
  }

  // NOTE: Populating `matches` requires looping through each page's
  // getTextContent() result and checking for searchQuery substring matches.
  // This is wired up where pages are rendered, since it needs access
  // to each page's PDF.js proxy object.

  return {
    searchQuery, setSearchQuery, matches, setMatches,
    currentMatch, setCurrentMatch,
    goToNextMatch, goToPrevMatch, focusSearch,
  };
}
```

---

### PreviewModal.jsx — dashboard preview

```jsx
import PdfViewer from './PdfViewer';

export default function PreviewModal({ document, signedUrl, onClose }) {
  if (!document) return null;

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <button style={styles.closeBtn} onClick={onClose}>✕</button>
        <div style={styles.viewerWrap}>
          <PdfViewer
            url={signedUrl}
            title={document.title}
            allowDownload={true}
          />
        </div>
      </div>
    </div>
  );
}

const styles = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  modal: { background: '#fff', borderRadius: 12, width: '90vw', height: '90vh', maxWidth: 900, position: 'relative', overflow: 'hidden' },
  closeBtn: { position: 'absolute', top: 8, right: 8, zIndex: 10, width: 32, height: 32, borderRadius: '50%', border: 'none', background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.2)', cursor: 'pointer', fontSize: 14 },
  viewerWrap: { height: '100%' },
};
```

---

### Updated Viewer.jsx — swap iframe for PdfViewer

In the file from Phase 3, replace this:

```jsx
{/* OLD — Phase 3 */}
<iframe src={pdfUrl} style={styles.iframe} title={title} />
```

with this:

```jsx
{/* NEW — Phase 4 */}
<div style={{ flex: 1 }}>
  <PdfViewer url={pdfUrl} title={title} allowDownload={allowDownload} />
</div>
```

And add the import at the top:
```jsx
import PdfViewer from '../components/PdfViewer';
```

You can now remove the `iframe` style entry from `styles` since it's unused.

---

### Dashboard integration — add Preview button

In `DocumentCard.jsx`, add a Preview button that:
1. Calls `GET /api/documents/:id/signed-url` to get a fresh signed URL
2. Opens `PreviewModal` with that URL and the document's title

```jsx
async function handlePreview() {
  const res = await api.get(`/documents/${doc.id}/signed-url`);
  setPreviewUrl(res.data.signedUrl);
  setShowPreview(true);
}
```

```jsx
{showPreview && (
  <PreviewModal
    document={doc}
    signedUrl={previewUrl}
    onClose={() => setShowPreview(false)}
  />
)}
```

---

## Step 5 — Responsive considerations

On smaller screens, the toolbar wraps using `flexWrap: 'wrap'` (already set in
the styles above). For a cleaner mobile experience, you can conditionally hide
the fullscreen and fit-width buttons below a certain `containerWidth` threshold:

```jsx
const isMobile = containerWidth && containerWidth < 480;

{!isMobile && <button onClick={onFitWidth}>Fit</button>}
{!isMobile && <button onClick={onFullscreen}>⛶</button>}
```

---

## Complete file structure after Phase 4

```
livepdf/
├── server/                          (unchanged from Phase 3)
│
└── client/
    └── src/
        ├── main.jsx                 ← UPDATED (import pdfWorker)
        ├── App.jsx
        ├── context/AuthContext.jsx
        ├── components/
        │   ├── ProtectedRoute.jsx
        │   ├── UploadZone.jsx
        │   ├── DocumentCard.jsx     ← UPDATED (add Preview button)
        │   ├── ProgressBar.jsx
        │   ├── ShareModal.jsx
        │   ├── ShareLinkRow.jsx
        │   ├── PasswordGate.jsx
        │   ├── PdfViewer.jsx        ← NEW
        │   ├── PdfToolbar.jsx       ← NEW
        │   ├── SearchBar.jsx        ← NEW
        │   └── PreviewModal.jsx     ← NEW
        ├── hooks/
        │   └── usePdfSearch.js      ← NEW
        ├── pages/
        │   ├── Login.jsx
        │   ├── Signup.jsx
        │   ├── VerifyEmail.jsx
        │   ├── Dashboard.jsx
        │   └── Viewer.jsx           ← UPDATED (PdfViewer instead of iframe)
        └── utils/
            ├── api.js
            ├── formatters.js
            ├── clipboard.js
            └── pdfWorker.js         ← NEW
```

---

## How to test Phase 4

### Basic rendering
1. Open a public share link from Phase 3 (`/view/:token`)
2. The PDF should render as a canvas, not an iframe
3. Open browser dev tools → Elements tab → confirm you see a `<canvas>` element, not `<iframe>`

### Page navigation
1. Click the `›` button — page number increases, next page renders
2. Click `‹` on page 1 — button should be disabled, nothing happens
3. Type a page number directly into the page input and press a key — jumps to that page

### Zoom
1. Click `+` several times — PDF gets larger, percentage label updates
2. Click `−` — PDF shrinks
3. At 50% and 200%, the respective button should have no further effect
4. Click "Fit" — PDF width matches the container width

### Full-screen
1. Click the `⛶` button — viewer expands to fill the screen
2. Press Escape — exits full-screen
3. Click `⛶` again while in full-screen — exits full-screen

### Search
1. Type a word that appears in the document into the search box
2. Match count should show like "1 / 4"
3. Click `›` and `‹` to cycle through matches

### Download
1. Click Download — a file download should start named after the document title
2. Open the downloaded file — should be identical to the viewed PDF

### Keyboard shortcuts
1. With the viewer focused (not typing in an input), press the right arrow — next page
2. Press `+` and `-` — zoom in/out
3. Press `/` — focuses the search input

### Dashboard preview
1. On the dashboard, click Preview on a document card
2. Modal opens with the same PdfViewer component
3. Click outside the modal or the ✕ — modal closes

---

## Common errors and fixes

| Error | Cause | Fix |
|---|---|---|
| `Failed to fetch dynamically imported module` for pdf.worker | Worker URL mismatch | Ensure the CDN URL in pdfWorker.js uses `pdfjs.version` exactly |
| PDF renders blank/white | Worker not configured | Confirm `pdfWorker.js` is imported in `main.jsx` before any PdfViewer renders |
| `Could not load this document` error | Signed URL expired (15 min limit) | Re-fetch a fresh signed URL; add a "Retry" button that calls the resolver again |
| Search finds nothing on a scanned PDF | PDF has no text layer (it's an image) | This is expected — scanned PDFs without OCR have no searchable text |
| Fullscreen button does nothing on iOS Safari | iOS restricts the Fullscreen API | Known platform limitation — consider hiding the button on iOS |
| Page input lets you type non-numbers | No validation on input | Add `Number(value) || 1` clamping before calling `onGoToPage` |

---

## Performance notes

**Render only the current page** — PdfViewer renders one `<Page>` at a time
rather than all pages at once. For very large PDFs (100+ pages), rendering
every page simultaneously would be slow and memory-heavy.

**renderAnnotationLayer is off** — Annotations (form fields, links) are disabled
by default since LivePDF documents are typically static reports/contracts, not
fillable forms. If you need clickable links inside PDFs, set this to `true`.

**Text layer stays on** — `renderTextLayer={true}` is required for both search
and for users to select/copy text — a small performance cost worth keeping.

---

## What's next — Phase 5

Phase 5 adds real-time synchronization using Socket.IO:

- When the owner uploads a new version, all open viewers get notified instantly
- The PdfViewer component you just built will re-fetch the signed URL and
  re-render automatically when a `doc:updated` event arrives
- A toast notification ("Document updated to v3") appears in the viewer
- Connection resilience — if a viewer was offline when the update happened,
  it catches up via REST when it reconnects
