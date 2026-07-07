# LivePDF — Phase 5: Real-Time Synchronization (Socket.IO)

## What Phase 5 adds

Phase 5 is the feature that makes LivePDF fundamentally different from email or
WhatsApp. When the owner uploads a new version, every person who has that document
open in their browser sees it update automatically — no refresh, no new link, no
action required. This works using WebSockets managed by Socket.IO, which keeps a
persistent connection open between the browser and the server.

---

## Prerequisites

- Phase 1, 2, 3, and 4 fully working
- Phase 2's upload endpoint working (we add the emit call here)
- Phase 4's PdfViewer component working (we add the socket listener here)
- Phase 3's resolver endpoint returns a documentId alongside the signedUrl

---

## Step 1 — Install new dependencies

```bash
# Backend
cd server
npm install socket.io

# Frontend
cd client
npm install socket.io-client
```

---

## Step 2 — Environment variables

No new variables needed. Socket.IO shares the same port (5000) and CORS origin
(`CLIENT_URL`) already in your `.env`.

However, add this to `client/.env` (create it if it does not exist):

```env
VITE_API_URL=http://localhost:5000/api
VITE_SOCKET_URL=http://localhost:5000
```

---

## Step 3 — New files to create

### Backend files

```
server/src/
└── socket.js        ← Socket.IO server setup, room management, auth middleware
```

### Frontend files

```
client/src/
├── hooks/
│   ├── useSocket.js         ← connects to Socket.IO, joins doc room, handles events
│   └── useSignedUrlRefresh.js  ← re-fetches signed URL every 12 min before expiry
└── components/
    ├── ConnectionStatus.jsx ← green/amber dot in the viewer toolbar
    └── ViewerToast.jsx      ← "Document updated to v3" notification
```

### Updated files

```
server/src/
├── index.js                 ← UPDATED — attach Socket.IO to HTTP server
└── controllers/
    └── documentController.js ← UPDATED — emit doc:updated after version upload

client/src/
├── pages/
│   └── Viewer.jsx           ← UPDATED — connect socket, listen for doc:updated
└── components/
    ├── PdfViewer.jsx         ← UPDATED — accept onUpdate prop, preserve page on reload
    └── PdfToolbar.jsx        ← UPDATED — add ConnectionStatus dot
```

---

## Step 4 — Backend code walkthrough

### socket.js — full Socket.IO server

```js
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const pool = require('./config/db');

let io;

function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL || 'http://localhost:5173',
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  // ── Auth middleware ────────────────────────────────────────────
  // Runs before every connection is accepted.
  // Attaches decoded user to socket.data.user if token is valid.
  // Public viewers connect without a token — that is allowed.
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (token) {
      try {
        socket.data.user = jwt.verify(token, process.env.JWT_SECRET);
      } catch {
        // Invalid token — connect as anonymous (public viewer)
        socket.data.user = null;
      }
    } else {
      socket.data.user = null;
    }
    next();
  });

  // ── Connection handler ─────────────────────────────────────────
  io.on('connection', (socket) => {
    // Client sends: socket.emit('join:doc', { docId, linkType })
    socket.on('join:doc', async ({ docId, linkType }) => {
      if (!docId) return;

      // For private links — verify user has access
      if (linkType === 'private') {
        if (!socket.data.user) {
          socket.emit('error', { message: 'Authentication required' });
          return;
        }
        const access = await pool.query(
          `SELECT slr.id FROM share_link_recipients slr
           JOIN share_links sl ON sl.id = slr.share_link_id
           WHERE sl.document_id = $1 AND slr.email = $2`,
          [docId, socket.data.user.email]
        );
        if (access.rows.length === 0) {
          socket.emit('error', { message: 'Access denied' });
          return;
        }
      }

      const room = `doc:${docId}`;
      socket.join(room);

      // Tell everyone in the room how many viewers there are now
      const count = io.sockets.adapter.rooms.get(room)?.size || 0;
      io.to(room).emit('viewers:count', { count });

      // Tell this specific socket it successfully joined
      socket.emit('joined:doc', { docId });
    });

    // Client sends: socket.emit('leave:doc', { docId })
    socket.on('leave:doc', ({ docId }) => {
      const room = `doc:${docId}`;
      socket.leave(room);

      const count = io.sockets.adapter.rooms.get(room)?.size || 0;
      io.to(room).emit('viewers:count', { count });
    });

    // Clean up on disconnect
    socket.on('disconnect', () => {
      // Socket.IO automatically removes the socket from all rooms.
      // We don't need to manually leave rooms on disconnect.
    });
  });

  return io;
}

// Called by documentController after a successful version upload
function emitDocUpdated(docId, payload) {
  if (!io) return;
  io.to(`doc:${docId}`).emit('doc:updated', payload);
  // payload shape: { versionNumber, signedUrl, updatedAt }
}

// Called by documentController to get current viewer count
function getViewerCount(docId) {
  if (!io) return 0;
  return io.sockets.adapter.rooms.get(`doc:${docId}`)?.size || 0;
}

module.exports = { initSocket, emitDocUpdated, getViewerCount };
```

---

### Updated index.js — attach Socket.IO to HTTP server

Replace the `app.listen` call at the bottom of `index.js`:

```js
// OLD — Phase 1-4
app.listen(PORT, () => { ... });

// NEW — Phase 5
const http = require('http');
const { initSocket } = require('./socket');

const httpServer = http.createServer(app);
initSocket(httpServer);

httpServer.listen(PORT, () => {
  console.log(`LivePDF server running on http://localhost:${PORT}`);
  console.log(`Socket.IO attached on same port`);
});
```

Full updated bottom section of index.js:

```js
// At the top of index.js, add:
const http = require('http');
const { initSocket } = require('./socket');

// Replace app.listen with:
const PORT = process.env.PORT || 5000;
const httpServer = http.createServer(app);
initSocket(httpServer);

httpServer.listen(PORT, () => {
  console.log(`LivePDF server running on http://localhost:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV}`);
});

module.exports = { app, httpServer };
```

---

### Updated documentController.js — emit after version upload

In `uploadNewVersion` (and `uploadDocument` for first uploads too), after the
database write, add the emit call:

```js
const { emitDocUpdated } = require('../socket');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { GetObjectCommand } = require('@aws-sdk/client-s3');
const s3 = require('../config/s3');

// Inside uploadNewVersion, after UPDATE documents SET current_version_id...
// ─── Notify all open viewers ───────────────────────────────────
const command = new GetObjectCommand({
  Bucket: process.env.S3_BUCKET_NAME,
  Key: newS3Key,
});
const freshSignedUrl = await getSignedUrl(s3, command, { expiresIn: 900 });

emitDocUpdated(documentId, {
  versionNumber: newVersionNumber,
  signedUrl: freshSignedUrl,
  updatedAt: new Date().toISOString(),
});
// ──────────────────────────────────────────────────────────────

res.json({
  message: 'New version uploaded',
  versionNumber: newVersionNumber,
});
```

---

## Step 5 — Frontend code walkthrough

### useSocket.js — the core hook

This hook manages the entire socket lifecycle for a viewer:
- connects with the JWT token if available
- joins the document room
- listens for events
- handles reconnection and missed updates
- cleans up on unmount

```js
import { useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import api from '../utils/api';

export default function useSocket({ docId, linkType, currentVersion, onDocUpdated }) {
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [viewerCount, setViewerCount] = useState(null);

  // Fetch latest version via REST — used on reconnect to catch missed updates
  const catchUp = useCallback(async () => {
    try {
      const res = await api.get(`/share/${docId}/latest`);
      if (res.data.versionNumber > currentVersion) {
        onDocUpdated(res.data);
      }
    } catch {
      // Silent fail — socket will retry connection anyway
    }
  }, [docId, currentVersion, onDocUpdated]);

  useEffect(() => {
    if (!docId) return;

    const token = window.__livepdf_token__;

    const socket = io(import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000', {
      auth: { token: token || null },
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
    });

    socketRef.current = socket;

    // ── Connection events ────────────────────────────────────────
    socket.on('connect', () => {
      setConnected(true);
      setReconnecting(false);
      socket.emit('join:doc', { docId, linkType });
    });

    socket.on('disconnect', () => {
      setConnected(false);
    });

    socket.on('connect_error', () => {
      setReconnecting(true);
    });

    // On reconnect — catch up on any missed version updates
    socket.on('reconnect', () => {
      setConnected(true);
      setReconnecting(false);
      catchUp();
    });

    // ── Document events ──────────────────────────────────────────
    socket.on('doc:updated', (payload) => {
      onDocUpdated(payload);
    });

    socket.on('viewers:count', ({ count }) => {
      setViewerCount(count);
    });

    socket.on('joined:doc', () => {
      // Successfully joined the room
    });

    socket.on('error', ({ message }) => {
      console.warn('Socket error:', message);
    });

    // ── Cleanup ──────────────────────────────────────────────────
    return () => {
      socket.emit('leave:doc', { docId });
      socket.disconnect();
    };
  }, [docId]);

  return { connected, reconnecting, viewerCount };
}
```

---

### useSignedUrlRefresh.js — auto-refresh before expiry

Signed URLs expire after 15 minutes. This hook silently re-fetches a fresh one
every 12 minutes so the viewer never hits an expired URL mid-session.

```js
import { useEffect, useCallback } from 'react';
import api from '../utils/api';

const REFRESH_INTERVAL_MS = 12 * 60 * 1000; // 12 minutes

export default function useSignedUrlRefresh({ token, onRefresh }) {
  const refresh = useCallback(async () => {
    try {
      const res = await api.get(`/share/${token}`);
      if (res.data.signedUrl) {
        onRefresh(res.data.signedUrl);
      }
    } catch {
      // Signed URL refresh failed — user will see an error if they
      // try to navigate to a new page. Non-critical for current page.
    }
  }, [token, onRefresh]);

  useEffect(() => {
    const interval = setInterval(refresh, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refresh]);
}
```

---

### ConnectionStatus.jsx — live/reconnecting indicator

```jsx
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
```

---

### ViewerToast.jsx — update notification

```jsx
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
  }, [message]);

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
```

---

### Updated Viewer.jsx — wire everything together

Add these imports at the top:

```jsx
import useSocket from '../hooks/useSocket';
import useSignedUrlRefresh from '../hooks/useSignedUrlRefresh';
import ConnectionStatus from '../components/ConnectionStatus';
import ViewerToast from '../components/ViewerToast';
```

Add new state variables after existing ones:

```jsx
const [docId, setDocId] = useState(null);
const [versionNumber, setVersionNumber] = useState(null);
const [toastMessage, setToastMessage] = useState('');
const { token } = useParams();
```

Update the resolver call inside the useEffect to also capture docId and version:

```jsx
// Inside the resolve() function in Viewer.jsx useEffect
const res = await api.get(`/share/${token}`);
setPdfUrl(res.data.signedUrl);
setTitle(res.data.title);
setAllowDownload(res.data.allowDownload);
setDocId(res.data.documentId);           // ← NEW — backend must return this
setVersionNumber(res.data.versionNumber); // ← NEW — backend must return this
setState('pdf');
```

Update the resolver endpoint in shareController.js to include documentId and
versionNumber in the response:

```js
// In resolveToken, update the final res.json call:
res.json({
  signedUrl,
  title: link.title,
  allowDownload: link.allow_download,
  documentId: link.document_id,        // ← ADD THIS
  versionNumber: currentVersion.version_number, // ← ADD THIS
});
```

Handle incoming doc:updated event:

```jsx
const handleDocUpdated = useCallback((payload) => {
  setPdfUrl(payload.signedUrl);
  setVersionNumber(payload.versionNumber);
  setToastMessage(`Document updated to version ${payload.versionNumber}`);
}, []);
```

Use the socket hook:

```jsx
const { connected, reconnecting, viewerCount } = useSocket({
  docId,
  linkType: 'public',   // pass the actual linkType from the resolver response
  currentVersion: versionNumber,
  onDocUpdated: handleDocUpdated,
});
```

Use the signed URL refresh hook:

```jsx
useSignedUrlRefresh({
  token,
  onRefresh: (newUrl) => setPdfUrl(newUrl),
});
```

Add ConnectionStatus to the viewer header and ViewerToast at the bottom:

```jsx
// In the 'pdf' render state:
return (
  <div style={styles.page}>
    <div style={styles.header}>
      <span style={styles.title}>{title}</span>
      <ConnectionStatus connected={connected} reconnecting={reconnecting} />
      {viewerCount > 1 && (
        <span style={styles.viewerCount}>{viewerCount} viewing</span>
      )}
    </div>
    <div style={{ flex: 1 }}>
      <PdfViewer url={pdfUrl} title={title} allowDownload={allowDownload} />
    </div>
    <ViewerToast
      message={toastMessage}
      onDismiss={() => setToastMessage('')}
    />
  </div>
);
```

---

### Updated PdfViewer.jsx — preserve page number on URL change

When the signed URL changes (because the document updated), react-pdf re-renders.
Currently the page resets to 1. Add this fix:

```jsx
// Add a ref to track whether this is the first load or an update
const isFirstLoad = useRef(true);

// In onLoadSuccess:
function onLoadSuccess({ numPages }) {
  setNumPages(numPages);

  if (isFirstLoad.current) {
    // First load — start at page 1
    isFirstLoad.current = false;
    setStatus(numPages > 0 ? 'success' : 'empty');
  } else {
    // Document updated — stay on current page (clamp if new doc has fewer pages)
    setPageNumber(prev => Math.min(prev, numPages));
    setStatus(numPages > 0 ? 'success' : 'empty');
  }
}
```

---

## Step 6 — Add /share/:token/latest endpoint

The `catchUp` function in `useSocket.js` calls this endpoint on reconnect to
check whether a new version was published while the socket was offline.

Add to `shareController.js`:

```js
async function getLatestVersion(req, res) {
  const { token } = req.params;

  const linkResult = await pool.query(
    `SELECT sl.document_id, v.version_number, v.s3_key
     FROM share_links sl
     JOIN documents d ON d.id = sl.document_id
     JOIN versions v ON v.id = d.current_version_id
     WHERE sl.token = $1`,
    [token]
  );

  if (linkResult.rows.length === 0) {
    return res.status(404).json({ error: 'Link not found' });
  }

  const row = linkResult.rows[0];
  const signedUrl = await getSignedPdfUrl(row.s3_key);

  res.json({
    versionNumber: row.version_number,
    signedUrl,
  });
}
```

Add to `share.js` routes:

```js
router.get('/:token/latest', ctrl.getLatestVersion);
```

---

## API changes in Phase 5

### Updated response from GET /api/share/:token

```json
{
  "signedUrl": "https://s3.amazonaws.com/...",
  "title": "Contract v3.pdf",
  "allowDownload": true,
  "documentId": "uuid-here",
  "versionNumber": 2
}
```

### New endpoint: GET /api/share/:token/latest

Returns the current version number and a fresh signed URL.
Used by the client on socket reconnect to catch missed updates.

```json
{
  "versionNumber": 3,
  "signedUrl": "https://s3.amazonaws.com/..."
}
```

### Socket events — client to server

| Event | Payload | Description |
|---|---|---|
| `join:doc` | `{ docId, linkType }` | Join the document's room |
| `leave:doc` | `{ docId }` | Leave the room (sent before disconnect) |

### Socket events — server to client

| Event | Payload | Description |
|---|---|---|
| `doc:updated` | `{ versionNumber, signedUrl, updatedAt }` | New version uploaded |
| `viewers:count` | `{ count }` | Live viewer count for this document |
| `joined:doc` | `{ docId }` | Confirmation that room join succeeded |
| `error` | `{ message }` | Room join rejected (auth failure) |

---

## Complete file structure after Phase 5

```
livepdf/
├── server/
│   ├── src/
│   │   ├── index.js                  ← UPDATED (http.createServer + initSocket)
│   │   ├── socket.js                 ← NEW
│   │   ├── config/
│   │   │   ├── db.js
│   │   │   └── s3.js
│   │   ├── middleware/
│   │   │   ├── auth.js
│   │   │   └── upload.js
│   │   ├── controllers/
│   │   │   ├── authController.js
│   │   │   ├── documentController.js ← UPDATED (emitDocUpdated after upload)
│   │   │   └── shareController.js    ← UPDATED (return documentId + versionNumber,
│   │   │                                         add getLatestVersion)
│   │   └── routes/
│   │       ├── auth.js
│   │       ├── documents.js
│   │       └── share.js              ← UPDATED (add /:token/latest route)
│   └── migrations/
│       ├── schema.sql
│       ├── run.js
│       └── phase3.sql
│
└── client/
    ├── .env                          ← UPDATED (add VITE_SOCKET_URL)
    └── src/
        ├── main.jsx                  ← (pdfWorker import from Phase 4)
        ├── App.jsx
        ├── context/AuthContext.jsx
        ├── hooks/
        │   ├── usePdfSearch.js
        │   ├── useSocket.js          ← NEW
        │   └── useSignedUrlRefresh.js ← NEW
        ├── components/
        │   ├── ProtectedRoute.jsx
        │   ├── UploadZone.jsx
        │   ├── DocumentCard.jsx
        │   ├── ProgressBar.jsx
        │   ├── ShareModal.jsx
        │   ├── ShareLinkRow.jsx
        │   ├── PasswordGate.jsx
        │   ├── PdfViewer.jsx         ← UPDATED (preserve page on URL change)
        │   ├── PdfToolbar.jsx        ← UPDATED (add ConnectionStatus)
        │   ├── SearchBar.jsx
        │   ├── PreviewModal.jsx
        │   ├── ConnectionStatus.jsx  ← NEW
        │   └── ViewerToast.jsx       ← NEW
        ├── pages/
        │   ├── Login.jsx
        │   ├── Signup.jsx
        │   ├── VerifyEmail.jsx
        │   ├── Dashboard.jsx
        │   └── Viewer.jsx            ← UPDATED (useSocket, useSignedUrlRefresh,
        │                                         ConnectionStatus, ViewerToast)
        └── utils/
            ├── api.js
            ├── formatters.js
            ├── clipboard.js
            └── pdfWorker.js
```

---

## How to test Phase 5

### The core real-time test — do this first

1. Generate a public share link for any document from the dashboard
2. Open that share link in **Browser Window A** — PDF loads and renders
3. Open the **Dashboard** in **Browser Window B** (logged in)
4. In Window B — click Replace on that document and upload a new PDF
5. Watch Window A — within 1–2 seconds the PDF updates automatically
6. The toast "Document updated to version 2" appears in Window A

### Test the connection status indicator

1. Open a share link
2. Green dot should appear: "Live"
3. Stop the server (`Ctrl+C` in the server terminal)
4. Dot turns amber: "Reconnecting…"
5. Restart the server (`npm run dev`)
6. Dot turns green again: "Live"

### Test reconnection catches missed updates

1. Open a share link in Browser Window A
2. Stop the server
3. While the server is down, upload a new version via the API directly or note the version
4. Restart the server
5. Window A reconnects and calls `/share/:token/latest`
6. If a newer version exists, the PDF updates and toast shows

### Test signed URL refresh

1. Open a share link
2. In the browser console, run:
   ```js
   // Simulate the 12-minute timer firing immediately
   // (find the interval in useSignedUrlRefresh and trigger it)
   ```
3. Monitor the Network tab — you should see a GET request to `/share/:token`
4. The PDF continues rendering without any visible interruption

### Test viewer count

1. Open the same share link in 3 different browser tabs
2. Each tab should show "3 viewing" in the header
3. Close one tab
4. Remaining tabs update to "2 viewing"

### Test multiple simultaneous viewers

1. Open the same share link in 5 tabs
2. Upload a new version from the dashboard
3. All 5 tabs should update within 1–2 seconds
4. All 5 should show the toast notification

---

## Common errors and fixes

| Error | Cause | Fix |
|---|---|---|
| `WebSocket connection failed` in browser console | CORS misconfigured on Socket.IO | Check `CLIENT_URL` in `.env` matches exactly (including port) |
| Socket connects but `doc:updated` never fires | `emitDocUpdated` not called after upload | Add `console.log('emitting...')` in documentController to confirm |
| Viewer count always shows 1 | `join:doc` event not emitted by client | Check `useSocket.js` — the `join:doc` emit must be inside the `connect` handler |
| PDF resets to page 1 on update | `isFirstLoad` ref not implemented | Apply the `isFirstLoad.current` fix in PdfViewer.jsx |
| `catchUp` fires but PDF doesn't update | Version comparison wrong | Log `res.data.versionNumber` and `currentVersion` to compare |
| Reconnecting loop never stops | Server not restarted or wrong port | Confirm server is running on 5000 and `VITE_SOCKET_URL` points to it |
| Toast appears but immediately disappears | `onDismiss` clearing state too fast | Check the 4000ms timeout in ViewerToast — do not call `onDismiss` before it fires |

---

## Security notes for Phase 5

**Token in socket handshake, not in URL** — The JWT is passed in
`socket.handshake.auth.token` (the Socket.IO auth object), not as a query
parameter. Query parameters appear in server logs — auth objects do not.

**Room names are internal** — Clients join a room called `doc:{uuid}`. The UUID
is the database document ID, which is not guessable. Even if someone knows a
room name, they cannot join a private document room without a valid JWT and
an email in the share_link_recipients table.

**Server-side room validation** — The `join:doc` handler on the server validates
access before calling `socket.join(room)`. A client cannot join a room just by
emitting the event — the server controls who is allowed in.

**Signed URLs in events are fresh** — The `doc:updated` event carries a newly
generated signed URL (not the old one), so recipients get a URL with a full
fresh 15-minute window the moment they receive the update.

---

## What's next — Phase 6

Phase 6 builds the diff engine on top of Phase 5's real-time foundation:

- Python FastAPI microservice extracts text blocks from both PDF versions
- difflib computes exactly which blocks changed (added / removed / modified)
- The change map is pushed to viewers via the same `doc:updated` Socket.IO event
- PdfViewer overlays colored rectangles on changed regions
- Green for added, red for removed, amber for modified
- Click any highlight to see the old text vs new text in a tooltip
