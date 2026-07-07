# LivePDF — Phase 3: Share Links

## What Phase 3 adds

Phase 3 makes LivePDF useful to other people. Until now only the document owner
can see their PDFs. Phase 3 adds the ability to generate shareable links — public,
private, and password-protected — that always resolve to the latest version of a
document automatically. This is the core feature that solves the WhatsApp problem:
the recipient opens the same link forever and always sees the current version.

---

## Prerequisites

- Phase 1 fully working (auth, JWT, PostgreSQL)
- Phase 2 fully working (S3 upload, document cards on dashboard)
- share_links and audit_logs tables already exist from Phase 1 schema

---

## Step 1 — Install new dependencies

```bash
cd server
npm install bcryptjs   # already installed in Phase 1, no action needed
```

No new npm packages needed for Phase 3 — everything required is already installed.
The crypto module used for token generation is built into Node.js.

---

## Step 2 — No new database tables needed

The share_links and audit_logs tables were already created in Phase 1's schema.sql.
Just confirm the columns are what you expect:

```sql
-- Verify in psql
\d share_links
\d audit_logs
```

share_links should have:
- id, document_id, token, link_type, password_hash
- allow_download, expires_at, created_by, created_at

audit_logs should have:
- id, document_id, user_id, action, ip_address, metadata, created_at

If they exist, you are ready. No migration needed.

---

## Step 3 — New files to create

### Backend files

```
server/src/
├── controllers/
│   └── shareController.js     ← generate, resolve, unlock, list, delete links
└── routes/
    └── share.js               ← route definitions for all share endpoints
```

### Frontend files

```
client/src/
├── pages/
│   └── Viewer.jsx             ← public PDF viewer page (no login required)
├── components/
│   ├── ShareModal.jsx         ← modal with 3 tabs: Public / Private / Protected
│   ├── ShareLinkRow.jsx       ← single row in the existing links table
│   └── PasswordGate.jsx       ← password entry form for protected links
└── utils/
    └── clipboard.js           ← copy to clipboard with fallback
```

---

## Step 4 — Backend code walkthrough

### Token generation

```js
const crypto = require('crypto');

function generateToken() {
  // 32 random bytes → 64 character hex string
  // Cannot be guessed — 2^256 possible values
  return crypto.randomBytes(32).toString('hex');
}
```

### shareController.js — all functions

---

#### createShareLink — POST /api/documents/:id/share

Logic order:
1. Verify JWT — only the owner can create share links
2. Check document exists and belongs to req.user.id
3. Validate link_type is one of: public, private, protected
4. If protected — hash the password with bcrypt (cost 10)
5. If private — validate that allowedEmails is a non-empty array
6. Generate token with crypto.randomBytes
7. Insert into share_links table
8. If private — insert each allowed email into a share_link_recipients table
9. Build the full URL: `${process.env.CLIENT_URL}/view/${token}`
10. Return the URL + link metadata to frontend

```js
async function createShareLink(req, res) {
  const { id: documentId } = req.params;
  const {
    linkType,        // 'public' | 'private' | 'protected'
    password,        // only for protected
    allowedEmails,   // only for private — array of strings
    allowDownload,   // boolean, default true
    expiresAt,       // ISO date string or null
  } = req.body;

  // Verify ownership
  const doc = await pool.query(
    'SELECT id FROM documents WHERE id = $1 AND owner_id = $2',
    [documentId, req.user.id]
  );
  if (doc.rows.length === 0) {
    return res.status(403).json({ error: 'Document not found or access denied' });
  }

  let passwordHash = null;
  if (linkType === 'protected') {
    if (!password) return res.status(400).json({ error: 'Password required for protected links' });
    passwordHash = await bcrypt.hash(password, 10);
  }

  if (linkType === 'private') {
    if (!allowedEmails || allowedEmails.length === 0) {
      return res.status(400).json({ error: 'At least one email required for private links' });
    }
  }

  const token = generateToken();

  const result = await pool.query(
    `INSERT INTO share_links
      (document_id, token, link_type, password_hash, allow_download, expires_at, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, token, link_type, allow_download, expires_at, created_at`,
    [documentId, token, linkType, passwordHash,
     allowDownload ?? true, expiresAt || null, req.user.id]
  );

  const link = result.rows[0];

  // For private links — store allowed emails
  if (linkType === 'private' && allowedEmails?.length > 0) {
    const emailInserts = allowedEmails.map(email =>
      pool.query(
        'INSERT INTO share_link_recipients (share_link_id, email) VALUES ($1, $2)',
        [link.id, email.toLowerCase()]
      )
    );
    await Promise.all(emailInserts);
  }

  res.status(201).json({
    url: `${process.env.CLIENT_URL}/view/${token}`,
    linkId: link.id,
    token: link.token,
    linkType: link.link_type,
    allowDownload: link.allow_download,
    expiresAt: link.expires_at,
    createdAt: link.created_at,
  });
}
```

---

#### resolveToken — GET /api/share/:token

This is the most important function. It runs every time a recipient opens a link.

```js
async function resolveToken(req, res) {
  const { token } = req.params;

  // 1. Find the share link
  const linkResult = await pool.query(
    `SELECT sl.*, d.current_version_id, d.title
     FROM share_links sl
     JOIN documents d ON d.id = sl.document_id
     WHERE sl.token = $1`,
    [token]
  );

  if (linkResult.rows.length === 0) {
    return res.status(404).json({ error: 'Link not found' });
  }

  const link = linkResult.rows[0];

  // 2. Check expiry
  if (link.expires_at && new Date() > new Date(link.expires_at)) {
    return res.status(410).json({ error: 'This link has expired' });
  }

  // 3. Check link type
  if (link.link_type === 'protected') {
    // Password must be submitted via POST /unlock — not here
    return res.status(401).json({
      requiresPassword: true,
      title: link.title,
      allowDownload: link.allow_download,
    });
  }

  if (link.link_type === 'private') {
    // Must be logged in and email must be in recipients list
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ requiresLogin: true });
    }
    try {
      const decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
      const allowed = await pool.query(
        'SELECT id FROM share_link_recipients WHERE share_link_id = $1 AND email = $2',
        [link.id, decoded.email.toLowerCase()]
      );
      if (allowed.rows.length === 0) {
        return res.status(403).json({ error: 'You do not have access to this document' });
      }
    } catch {
      return res.status(401).json({ requiresLogin: true });
    }
  }

  // 4. All checks passed — get signed URL
  const signedUrl = await getSignedPdfUrl(link.current_version_id);

  // 5. Log the view
  await pool.query(
    `INSERT INTO audit_logs (document_id, action, ip_address, metadata)
     VALUES ($1, 'view', $2, $3)`,
    [link.document_id, req.ip, JSON.stringify({ token, linkType: link.link_type })]
  );

  res.json({
    signedUrl,
    title: link.title,
    allowDownload: link.allow_download,
  });
}
```

---

#### unlockProtectedLink — POST /api/share/:token/unlock

```js
async function unlockProtectedLink(req, res) {
  const { token } = req.params;
  const { password } = req.body;

  if (!password) {
    return res.status(400).json({ error: 'Password required' });
  }

  const linkResult = await pool.query(
    `SELECT sl.*, d.current_version_id, d.title
     FROM share_links sl
     JOIN documents d ON d.id = sl.document_id
     WHERE sl.token = $1 AND sl.link_type = 'protected'`,
    [token]
  );

  // Always respond the same way whether token exists or not
  // This prevents attackers from discovering valid tokens
  if (linkResult.rows.length === 0) {
    return res.status(401).json({ error: 'Incorrect password' });
  }

  const link = linkResult.rows[0];

  // Check expiry
  if (link.expires_at && new Date() > new Date(link.expires_at)) {
    return res.status(410).json({ error: 'This link has expired' });
  }

  const passwordMatch = await bcrypt.compare(password, link.password_hash);
  if (!passwordMatch) {
    return res.status(401).json({ error: 'Incorrect password' });
  }

  const signedUrl = await getSignedPdfUrl(link.current_version_id);

  // Log the view
  await pool.query(
    `INSERT INTO audit_logs (document_id, action, ip_address, metadata)
     VALUES ($1, 'view', $2, $3)`,
    [link.document_id, req.ip, JSON.stringify({ token, linkType: 'protected' })]
  );

  res.json({
    signedUrl,
    title: link.title,
    allowDownload: link.allow_download,
  });
}
```

---

#### listShareLinks — GET /api/documents/:id/share-links

```js
async function listShareLinks(req, res) {
  // Verify ownership first
  const doc = await pool.query(
    'SELECT id FROM documents WHERE id = $1 AND owner_id = $2',
    [req.params.id, req.user.id]
  );
  if (doc.rows.length === 0) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const links = await pool.query(
    `SELECT id, token, link_type, allow_download, expires_at, created_at,
            (SELECT COUNT(*) FROM audit_logs
             WHERE document_id = $1
             AND metadata->>'token' = token) AS view_count
     FROM share_links
     WHERE document_id = $1
     ORDER BY created_at DESC`,
    [req.params.id]
  );

  res.json(links.rows.map(l => ({
    ...l,
    url: `${process.env.CLIENT_URL}/view/${l.token}`,
  })));
}
```

---

#### deleteShareLink — DELETE /api/share/:linkId

```js
async function deleteShareLink(req, res) {
  // Verify ownership via join
  const result = await pool.query(
    `DELETE FROM share_links sl
     USING documents d
     WHERE sl.id = $1
       AND sl.document_id = d.id
       AND d.owner_id = $2
     RETURNING sl.id`,
    [req.params.linkId, req.user.id]
  );

  if (result.rows.length === 0) {
    return res.status(403).json({ error: 'Link not found or access denied' });
  }

  res.json({ message: 'Link deleted successfully' });
}
```

---

### share.js — routes

```js
const router = require('express').Router();
const auth = require('../middleware/auth');
const ctrl = require('../controllers/shareController');

// Public — no auth needed (resolver handles its own auth checks internally)
router.get('/:token',         ctrl.resolveToken);
router.post('/:token/unlock', ctrl.unlockProtectedLink);

// Owner only — requires JWT
router.post('/documents/:id/share',        auth, ctrl.createShareLink);
router.get('/documents/:id/share-links',   auth, ctrl.listShareLinks);
router.delete('/:linkId',                  auth, ctrl.deleteShareLink);

module.exports = router;
```

Register in index.js:
```js
const shareRoutes = require('./routes/share');
app.use('/api/share', shareRoutes);
```

---

## Step 5 — Extra table for private link recipients

Phase 1 schema did not include this table. Add it now:

```sql
-- Run this in psql or add to a new migration file
CREATE TABLE IF NOT EXISTS share_link_recipients (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  share_link_id UUID NOT NULL REFERENCES share_links(id) ON DELETE CASCADE,
  email         VARCHAR(255) NOT NULL,
  UNIQUE(share_link_id, email)
);

CREATE INDEX IF NOT EXISTS idx_slr_link ON share_link_recipients(share_link_id);
CREATE INDEX IF NOT EXISTS idx_slr_email ON share_link_recipients(email);
```

Save this as `server/migrations/phase3.sql` and run:
```bash
psql -U postgres -d livepdf -f server/migrations/phase3.sql
```

---

## Step 6 — Frontend code walkthrough

### Viewer.jsx — public viewer page

This page lives at `/view/:token` and is NOT wrapped in ProtectedRoute.
It is publicly accessible to anyone with the link.

```jsx
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../utils/api';
import PasswordGate from '../components/PasswordGate';

export default function Viewer() {
  const { token } = useParams();
  const [state, setState] = useState('loading'); // loading | pdf | password | error
  const [pdfUrl, setPdfUrl] = useState(null);
  const [title, setTitle] = useState('');
  const [allowDownload, setAllowDownload] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    async function resolve() {
      try {
        const res = await api.get(`/share/${token}`);
        setPdfUrl(res.data.signedUrl);
        setTitle(res.data.title);
        setAllowDownload(res.data.allowDownload);
        setState('pdf');
      } catch (err) {
        const data = err.response?.data;
        if (data?.requiresPassword) {
          setTitle(data.title);
          setAllowDownload(data.allowDownload);
          setState('password');
        } else if (data?.requiresLogin) {
          setState('error');
          setErrorMsg('This link is private. Please log in to access it.');
        } else if (err.response?.status === 410) {
          setState('error');
          setErrorMsg('This link has expired.');
        } else if (err.response?.status === 403) {
          setState('error');
          setErrorMsg('You do not have access to this document.');
        } else {
          setState('error');
          setErrorMsg('Link not found or invalid.');
        }
      }
    }
    resolve();
  }, [token]);

  if (state === 'loading') return <div style={styles.center}>Loading document…</div>;

  if (state === 'error') return (
    <div style={styles.center}>
      <h2 style={{ color: '#b91c1c' }}>Cannot open document</h2>
      <p style={{ color: '#555', marginTop: 8 }}>{errorMsg}</p>
    </div>
  );

  if (state === 'password') return (
    <PasswordGate
      token={token}
      onUnlock={(url, dl) => { setPdfUrl(url); setAllowDownload(dl); setState('pdf'); }}
    />
  );

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <span style={styles.title}>{title}</span>
        {allowDownload && (
          <a href={pdfUrl} download style={styles.downloadBtn}>Download</a>
        )}
      </div>
      {/* Phase 4 replaces this iframe with a full react-pdf viewer */}
      <iframe
        src={pdfUrl}
        style={styles.iframe}
        title={title}
      />
    </div>
  );
}

const styles = {
  page: { display: 'flex', flexDirection: 'column', height: '100vh', background: '#f0f0f0' },
  header: { background: '#fff', borderBottom: '0.5px solid #e0e0e0', padding: '0 1.5rem', height: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 15, fontWeight: 500, color: '#1a1a1a' },
  downloadBtn: { fontSize: 13, padding: '6px 14px', background: '#1a1a1a', color: '#fff', borderRadius: 6, textDecoration: 'none' },
  iframe: { flex: 1, border: 'none', width: '100%' },
  center: { minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' },
};
```

---

### PasswordGate.jsx

```jsx
import { useState } from 'react';
import api from '../utils/api';

export default function PasswordGate({ token, onUnlock }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.post(`/share/${token}/unlock`, { password });
      onUnlock(res.data.signedUrl, res.data.allowDownload);
    } catch (err) {
      setError(err.response?.data?.error || 'Incorrect password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h2 style={styles.title}>🔒 Protected document</h2>
        <p style={styles.sub}>Enter the password to view this document.</p>
        {error && <div style={styles.error}>{error}</div>}
        <form onSubmit={handleSubmit} style={styles.form}>
          <input
            style={styles.input}
            type="password"
            placeholder="Enter password"
            value={password}
            onChange={e => { setPassword(e.target.value); setError(''); }}
            required
            autoFocus
          />
          <button style={styles.btn} type="submit" disabled={loading}>
            {loading ? 'Unlocking…' : 'Unlock document'}
          </button>
        </form>
      </div>
    </div>
  );
}

const styles = {
  page: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f9f9f7' },
  card: { background: '#fff', border: '0.5px solid #e0e0e0', borderRadius: 12, padding: '2rem', width: '100%', maxWidth: 380 },
  title: { fontSize: 18, fontWeight: 500, marginBottom: 8, color: '#1a1a1a' },
  sub: { fontSize: 13, color: '#666', marginBottom: '1.25rem' },
  form: { display: 'flex', flexDirection: 'column', gap: 10 },
  input: { padding: '10px 12px', borderRadius: 8, border: '0.5px solid #d0d0d0', fontSize: 14, outline: 'none' },
  btn: { padding: 11, borderRadius: 8, background: '#1a1a1a', color: '#fff', border: 'none', fontSize: 14, fontWeight: 500, cursor: 'pointer' },
  error: { background: '#fff0f0', border: '0.5px solid #fca5a5', borderRadius: 8, padding: '9px 12px', fontSize: 13, color: '#b91c1c', marginBottom: 8 },
};
```

---

### ShareModal.jsx — structure overview

The modal opens when the user clicks Share on a document card.
It has three tabs at the top and a section below showing existing links.

```
┌─────────────────────────────────────────┐
│  Share "Contract v3.pdf"           ✕   │
├─────────────────────────────────────────┤
│  [Public]  [Private]  [Protected]       │
├─────────────────────────────────────────┤
│  Public tab:                            │
│  ┌─────────────────────────────────┐   │
│  │ livepdf.io/view/abc123...  [Copy]│   │
│  └─────────────────────────────────┘   │
│  [Allow download ✓]  [Generate link]    │
│                                         │
│  Expiry: [No expiry ▼]                 │
├─────────────────────────────────────────┤
│  Existing links                         │
│  Public  Created 2h ago  12 views  [✕] │
│  Protected  Expires Jan 1  3 views [✕] │
└─────────────────────────────────────────┘
```

State the modal manages:
- activeTab: 'public' | 'private' | 'protected'
- generatedUrl: string or null
- allowedEmails: array of strings (for private)
- password: string (for protected)
- allowDownload: boolean
- expiresAt: date string or null
- existingLinks: array fetched from GET /documents/:id/share-links

---

### clipboard.js — copy with fallback

```js
export async function copyToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return true;
  }
  // Fallback for older browsers
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
  return true;
}
```

---

### Add Viewer route in App.jsx

```jsx
import Viewer from './pages/Viewer';

// Inside <Routes> — no ProtectedRoute wrapper
<Route path="/view/:token" element={<Viewer />} />
```

---

## API Endpoints (Phase 3)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | /api/share/:token | ❌ Public | Resolve token → return signed URL or challenge |
| POST | /api/share/:token/unlock | ❌ Public | Submit password for protected links |
| POST | /api/share/documents/:id/share | ✅ JWT | Create a new share link |
| GET | /api/share/documents/:id/share-links | ✅ JWT | List all links for a document |
| DELETE | /api/share/:linkId | ✅ JWT | Delete a specific share link |

---

## Complete file structure after Phase 3

```
livepdf/
├── server/
│   ├── src/
│   │   ├── index.js
│   │   ├── config/
│   │   │   ├── db.js
│   │   │   └── s3.js
│   │   ├── middleware/
│   │   │   ├── auth.js
│   │   │   └── upload.js
│   │   ├── controllers/
│   │   │   ├── authController.js
│   │   │   ├── documentController.js
│   │   │   └── shareController.js      ← NEW
│   │   ├── routes/
│   │   │   ├── auth.js
│   │   │   ├── documents.js
│   │   │   └── share.js                ← NEW
│   │   └── utils/
│   │       └── email.js
│   └── migrations/
│       ├── schema.sql
│       ├── run.js
│       └── phase3.sql                  ← NEW (share_link_recipients table)
│
└── client/
    └── src/
        ├── App.jsx                     ← UPDATED (add /view/:token route)
        ├── context/AuthContext.jsx
        ├── components/
        │   ├── ProtectedRoute.jsx
        │   ├── UploadZone.jsx
        │   ├── DocumentCard.jsx        ← UPDATED (add Share button)
        │   ├── ProgressBar.jsx
        │   ├── ShareModal.jsx          ← NEW
        │   ├── ShareLinkRow.jsx        ← NEW
        │   └── PasswordGate.jsx        ← NEW
        ├── pages/
        │   ├── Login.jsx
        │   ├── Signup.jsx
        │   ├── VerifyEmail.jsx
        │   ├── Dashboard.jsx
        │   └── Viewer.jsx              ← NEW
        └── utils/
            ├── api.js
            ├── formatters.js
            └── clipboard.js            ← NEW
```

---

## How to test Phase 3

### Test creating a public link

```bash
curl -X POST http://localhost:5000/api/share/documents/YOUR_DOC_ID/share \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{"linkType":"public","allowDownload":true}'
```

Expected response:
```json
{
  "url": "http://localhost:5173/view/abc123...",
  "linkId": "uuid",
  "linkType": "public",
  "allowDownload": true,
  "expiresAt": null
}
```

### Test opening the link (no auth needed)

```bash
curl http://localhost:5000/api/share/abc123...
```

Expected response:
```json
{
  "signedUrl": "https://s3.amazonaws.com/...",
  "title": "My Document",
  "allowDownload": true
}
```

### Test a protected link

```bash
# Create it
curl -X POST http://localhost:5000/api/share/documents/YOUR_DOC_ID/share \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{"linkType":"protected","password":"secret123","allowDownload":false}'

# Try to open it — should return requiresPassword: true
curl http://localhost:5000/api/share/TOKEN_HERE

# Unlock with correct password
curl -X POST http://localhost:5000/api/share/TOKEN_HERE/unlock \
  -H "Content-Type: application/json" \
  -d '{"password":"secret123"}'

# Try wrong password — should return 401
curl -X POST http://localhost:5000/api/share/TOKEN_HERE/unlock \
  -H "Content-Type: application/json" \
  -d '{"password":"wrongpassword"}'
```

### Test expiry

```bash
# Create link expiring in 1 second (for testing)
curl -X POST http://localhost:5000/api/share/documents/YOUR_DOC_ID/share \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{"linkType":"public","expiresAt":"2020-01-01T00:00:00Z"}'

# Open it — should return 410 Gone
curl http://localhost:5000/api/share/TOKEN_HERE
```

### Test in the browser

1. Log in → go to dashboard
2. Click Share on any document card
3. Choose Public tab → click Generate link → click Copy
4. Open the copied URL in an incognito window (no login)
5. PDF should render immediately
6. Go back to Share modal → choose Protected tab → set password → generate
7. Open that link in incognito → password form should appear
8. Enter wrong password → error appears
9. Enter correct password → PDF renders
10. Back in modal → click ✕ on a link → it disappears from the list
11. Try to open the deleted link → 404 error page

---

## Common errors and fixes

| Error | Cause | Fix |
|---|---|---|
| `Link not found` on valid token | Token not in DB or typo | Check share_links table in psql |
| `This link has expired` immediately | expiresAt set to past date | Check the date format — must be ISO 8601 |
| `You do not have access` on private link | Email not in recipients | Verify share_link_recipients table has the right email |
| `Incorrect password` on correct password | bcrypt mismatch | Make sure you're not double-hashing — only hash once on creation |
| CORS error on /view/:token | Missing route in App.jsx | Add the Viewer route without ProtectedRoute wrapper |
| 403 on creating a share link | Wrong document ID or JWT | Confirm the document belongs to the logged-in user |

---

## Security decisions made in Phase 3

**Tokens are 64 hex characters** — Generated using `crypto.randomBytes(32)` which
is cryptographically secure. It is computationally impossible to guess a valid token
by brute force — there are 2^256 possible values.

**Passwords hashed with bcrypt** — The share link password is never stored in plain
text. Even if someone reads your database, they cannot recover passwords.

**Same error for wrong password and invalid token** — The unlock endpoint always
returns "Incorrect password" regardless of whether the token exists. This prevents
attackers from probing the API to discover which tokens are valid.

**Expiry checked on every request** — There is no background job that deactivates
expired links. The check happens at request time so expiry is always accurate to
the second.

**Ownership verified on every write** — Creating, listing, and deleting share links
all verify that the requesting user owns the document via a database join. A user
cannot create or delete links for someone else's document.

**Audit log on every view** — Every successful PDF view is logged with the token
used, the IP address, and the timestamp. This creates a full access history for
the document owner to review in Phase 7's analytics dashboard.

---

## What's next — Phase 4

Phase 4 builds the proper PDF viewer that replaces the basic iframe used in
Phase 3's Viewer.jsx:

- react-pdf (pdfjs-dist) renders PDFs page by page inside the app
- Page navigation with prev/next buttons and page number input
- Zoom in/out from 50% to 200%
- Full-screen mode
- Text search across the document
- The viewer is used by both the Viewer page (public) and the dashboard preview
