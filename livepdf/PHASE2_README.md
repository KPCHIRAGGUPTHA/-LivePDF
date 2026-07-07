# LivePDF — Phase 2: PDF Upload & Storage

## What Phase 2 adds

Phase 2 gives LivePDF its core purpose — uploading PDFs, storing them on AWS S3,
tracking every version in PostgreSQL, and displaying everything on the dashboard.
By the end of this phase, users can upload PDFs, replace them with newer versions,
and delete them. Every version is permanently saved and tracked.

---

## Prerequisites

- Phase 1 fully working (auth, database, JWT)
- An AWS account (free tier is enough to start)
- Node.js 18+
- PostgreSQL running with the livepdf database from Phase 1

---

## Step 1 — AWS S3 setup (do this first)

### 1a. Create an S3 bucket

1. Go to https://s3.console.aws.amazon.com
2. Click **Create bucket**
3. Bucket name: `livepdf-documents` (must be globally unique — add your name if taken)
4. Region: choose the closest to you (e.g. `ap-south-1` for India)
5. **Block all public access: ON** (keep it private)
6. Click Create bucket

### 1b. Add CORS policy to the bucket

1. Open your bucket → **Permissions** tab → **Cross-origin resource sharing (CORS)**
2. Click Edit and paste this:

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "PUT", "POST", "DELETE"],
    "AllowedOrigins": ["http://localhost:5173", "https://yourdomain.com"],
    "ExposeHeaders": ["ETag"]
  }
]
```

3. Save changes

### 1c. Create IAM user and access keys

1. Go to https://console.aws.amazon.com/iam
2. Users → **Create user** → name it `livepdf-server`
3. Attach policy: **AmazonS3FullAccess**
4. After creation → **Security credentials** → **Create access key**
5. Choose **Application running outside AWS**
6. Copy the **Access key ID** and **Secret access key** — you only see the secret once

---

## Step 2 — Install new dependencies

```bash
cd server
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner multer uuid
```

```bash
cd client
npm install react-dropzone axios
```

---

## Step 3 — Update .env

Add these new variables to your existing `server/.env`:

```env
# AWS S3
AWS_ACCESS_KEY_ID=your_access_key_id_here
AWS_SECRET_ACCESS_KEY=your_secret_access_key_here
AWS_REGION=ap-south-1
S3_BUCKET_NAME=livepdf-documents

# Upload limits
MAX_FILE_SIZE_MB=50
```

---

## Step 4 — New files to create

### Backend files

```
server/src/
├── config/
│   └── s3.js                  ← AWS S3 client setup
├── middleware/
│   └── upload.js              ← Multer config (memory storage)
├── controllers/
│   └── documentController.js  ← upload, replace, delete, list
└── routes/
    └── documents.js           ← route definitions
```

### Frontend files

```
client/src/
├── pages/
│   └── Dashboard.jsx          ← replace placeholder with real dashboard
├── components/
│   ├── UploadZone.jsx         ← drag and drop upload area
│   ├── DocumentCard.jsx       ← individual document card
│   └── ProgressBar.jsx        ← upload progress indicator
└── utils/
    └── formatters.js          ← file size and date formatting helpers
```

---

## Step 5 — Backend code walkthrough

### s3.js — S3 client

```js
const { S3Client } = require('@aws-sdk/client-s3');

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

module.exports = s3;
```

### upload.js — Multer middleware

```js
const multer = require('multer');

const upload = multer({
  storage: multer.memoryStorage(),   // never touch disk
  limits: {
    fileSize: (process.env.MAX_FILE_SIZE_MB || 50) * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'), false);
    }
  },
});

module.exports = upload;
```

### documentController.js — key logic

**Upload new document:**
1. Multer reads file into memory buffer
2. Generate a UUID for the new document
3. Build S3 key: `{userId}/{docId}/v1.pdf`
4. PutObjectCommand to upload buffer to S3
5. INSERT into documents table (title, owner_id)
6. INSERT into versions table (doc_id, version=1, s3_key, file_size)
7. UPDATE documents SET current_version_id = new version id
8. Return document id and version number to frontend

**Upload new version (replace):**
1. Verify user owns the document (SELECT owner_id WHERE id = docId)
2. Get current max version number from versions table
3. Build new S3 key: `{userId}/{docId}/v{n+1}.pdf`
4. Upload to S3
5. INSERT new row into versions table
6. UPDATE documents SET current_version_id = new version id, updated_at = NOW()
7. Return new version number

**Delete document:**
1. Verify ownership
2. SELECT all s3_keys from versions WHERE document_id = docId
3. Loop and DELETE each from S3 using DeleteObjectCommand
4. DELETE from documents table (cascade deletes versions + share_links)

**List documents:**
```sql
SELECT
  d.id, d.title, d.created_at, d.updated_at,
  v.version_number, v.file_size, v.uploaded_at
FROM documents d
JOIN versions v ON v.id = d.current_version_id
WHERE d.owner_id = $1
ORDER BY d.updated_at DESC;
```

**Get signed URL:**
```js
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { GetObjectCommand } = require('@aws-sdk/client-s3');

const command = new GetObjectCommand({
  Bucket: process.env.S3_BUCKET_NAME,
  Key: s3Key,
});

const url = await getSignedUrl(s3, command, { expiresIn: 900 }); // 15 min
```

### documents.js — routes

```js
const router = require('express').Router();
const auth = require('../middleware/auth');
const upload = require('../middleware/upload');
const ctrl = require('../controllers/documentController');

router.get('/',                    auth, ctrl.listDocuments);
router.post('/upload',             auth, upload.single('pdf'), ctrl.uploadDocument);
router.post('/:id/upload-version', auth, upload.single('pdf'), ctrl.uploadNewVersion);
router.delete('/:id',              auth, ctrl.deleteDocument);
router.get('/:id/signed-url',      auth, ctrl.getSignedUrl);

module.exports = router;
```

Register in index.js:
```js
const documentRoutes = require('./routes/documents');
app.use('/api/documents', documentRoutes);
```

---

## Step 6 — Frontend code walkthrough

### UploadZone.jsx — drag and drop

```jsx
import { useDropzone } from 'react-dropzone';

export default function UploadZone({ onFileAccepted }) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { 'application/pdf': ['.pdf'] },
    maxSize: 50 * 1024 * 1024,   // 50 MB
    multiple: false,
    onDropAccepted: (files) => onFileAccepted(files[0]),
    onDropRejected: () => alert('Only PDF files under 50MB allowed'),
  });

  return (
    <div {...getRootProps()} style={isDragActive ? activeStyle : defaultStyle}>
      <input {...getInputProps()} />
      {isDragActive
        ? <p>Drop your PDF here</p>
        : <p>Drag a PDF here, or click to select</p>
      }
    </div>
  );
}
```

### ProgressBar.jsx

```jsx
export default function ProgressBar({ percent }) {
  return (
    <div style={{ background: '#eee', borderRadius: 4, height: 6 }}>
      <div style={{
        width: `${percent}%`,
        background: '#1a1a1a',
        height: '100%',
        borderRadius: 4,
        transition: 'width 0.2s',
      }} />
    </div>
  );
}
```

### Upload call with progress tracking

```js
const formData = new FormData();
formData.append('pdf', file);
formData.append('title', title);

await api.post('/documents/upload', formData, {
  headers: { 'Content-Type': 'multipart/form-data' },
  onUploadProgress: (e) => {
    const pct = Math.round((e.loaded / e.total) * 100);
    setProgress(pct);
  },
});
```

### DocumentCard.jsx — what each card shows

- Document title
- Version badge (e.g. v3)
- File size (formatted: 2.4 MB)
- Time since last update (e.g. "2 hours ago")
- Three buttons: Share / Replace / Delete

### formatters.js — utility helpers

```js
export function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function timeAgo(dateString) {
  const diff = Date.now() - new Date(dateString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  return `${Math.floor(hrs / 24)} days ago`;
}
```

---

## API Endpoints (Phase 2)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | /api/documents | ✅ JWT | List all your documents |
| POST | /api/documents/upload | ✅ JWT | Upload a new PDF |
| POST | /api/documents/:id/upload-version | ✅ JWT | Replace with new version |
| DELETE | /api/documents/:id | ✅ JWT | Delete document + all versions |
| GET | /api/documents/:id/signed-url | ✅ JWT | Get 15-min signed S3 URL |

---

## Complete file structure after Phase 2

```
livepdf/
├── server/
│   ├── src/
│   │   ├── index.js
│   │   ├── config/
│   │   │   ├── db.js
│   │   │   └── s3.js              ← NEW
│   │   ├── middleware/
│   │   │   ├── auth.js
│   │   │   └── upload.js          ← NEW
│   │   ├── controllers/
│   │   │   ├── authController.js
│   │   │   └── documentController.js  ← NEW
│   │   ├── routes/
│   │   │   ├── auth.js
│   │   │   └── documents.js       ← NEW
│   │   └── utils/
│   │       └── email.js
│   └── migrations/
│       ├── schema.sql
│       └── run.js
│
└── client/
    └── src/
        ├── App.jsx
        ├── context/AuthContext.jsx
        ├── components/
        │   ├── ProtectedRoute.jsx
        │   ├── UploadZone.jsx     ← NEW
        │   ├── DocumentCard.jsx   ← NEW
        │   └── ProgressBar.jsx    ← NEW
        ├── pages/
        │   ├── Login.jsx
        │   ├── Signup.jsx
        │   ├── VerifyEmail.jsx
        │   └── Dashboard.jsx      ← REPLACED (was placeholder)
        └── utils/
            ├── api.js
            └── formatters.js      ← NEW
```

---

## How to test Phase 2

### Test upload via curl

```bash
curl -X POST http://localhost:5000/api/documents/upload \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "title=My Contract" \
  -F "pdf=@/path/to/test.pdf"
```

Expected response:
```json
{
  "documentId": "uuid-here",
  "versionNumber": 1,
  "message": "Document uploaded successfully"
}
```

### Test list documents

```bash
curl http://localhost:5000/api/documents \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Test in the browser

1. Log in at localhost:5173/login
2. Dashboard should show empty state with upload zone
3. Drag a PDF onto the upload zone
4. Watch progress bar fill to 100%
5. Card appears on the dashboard showing title, v1, file size
6. Click Replace → upload another PDF → card updates to v2
7. Click Delete → card disappears

### Verify files are in S3

1. Go to AWS S3 console → your bucket
2. You should see: `{your-user-id}/{doc-id}/v1.pdf`
3. After replace: `{your-user-id}/{doc-id}/v2.pdf` also appears
4. After delete: both files are gone

---

## Common errors and fixes

| Error | Cause | Fix |
|---|---|---|
| `AccessDenied` from S3 | Wrong IAM permissions | Attach AmazonS3FullAccess to your IAM user |
| `NoSuchBucket` | Wrong bucket name in .env | Check S3_BUCKET_NAME matches exactly |
| `MulterError: File too large` | PDF exceeds 50MB limit | Increase MAX_FILE_SIZE_MB in .env |
| `Only PDF files allowed` | Wrong file type | Make sure file extension and MIME type are both PDF |
| `User does not own this document` | Wrong JWT or wrong doc ID | Check Authorization header is correct |
| CORS error in browser | S3 CORS not configured | Re-check Step 1b and save the CORS policy |

---

## Security decisions made in Phase 2

**Never write to disk** — Multer uses memoryStorage so the PDF buffer lives only in RAM during the upload. The server is stateless and can be scaled horizontally.

**Never expose S3 URLs** — All S3 access goes through signed URLs generated server-side with a 15-minute expiry. The bucket itself is fully private.

**Ownership check on every write** — Every replace and delete operation first checks that the logged-in user's ID matches the document's owner_id. If not, it returns 403 Forbidden before touching S3 or the database.

**Structured S3 keys** — Files are stored under `userId/docId/vN.pdf`. This namespacing means a bug in one user's files can never affect another user's files.

---

## What's next — Phase 3

Phase 3 builds the share link system on top of what Phase 2 created:

- Generate public, private, and password-protected share links
- Each link always resolves to the latest version of the document
- Recipients can open the PDF viewer without logging in (for public links)
- Links can have expiry dates and download restrictions
