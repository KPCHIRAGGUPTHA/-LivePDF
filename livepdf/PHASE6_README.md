# LivePDF — Phase 6: Diff Engine

## What Phase 6 adds

Phase 6 builds the diff engine — the feature that makes LivePDF novel and
research-paper worthy. When a new version is uploaded, every open viewer sees
exactly what changed highlighted directly on the PDF. Green for added text,
red for removed text, amber for modified text. Clicking any highlight shows
old vs new content side by side. This runs as a Python FastAPI microservice
using PyMuPDF and difflib, triggered automatically after every version upload.

---

## Prerequisites

- Phases 1–5 fully working
- Python 3.10+ installed
- Phase 5's Socket.IO `doc:updated` event working
- Phase 4's PdfViewer canvas rendering working (overlays go on top of it)
- Phase 2's version upload storing S3 keys in the versions table

---

## Step 1 — Set up the Python microservice

```bash
# Create the python folder at the project root (alongside server/ and client/)
mkdir python
cd python

# Create and activate a virtual environment
python3 -m venv venv
source venv/bin/activate        # Mac/Linux
venv\Scripts\activate           # Windows

# Install dependencies
pip install fastapi uvicorn pymupdf boto3 python-dotenv
```

Create `python/.env`:

```env
AWS_ACCESS_KEY_ID=your_access_key_id_here
AWS_SECRET_ACCESS_KEY=your_secret_access_key_here
AWS_REGION=ap-south-1
S3_BUCKET_NAME=livepdf-documents

# Port this service runs on
PORT=8001
```

Start the microservice:

```bash
cd python
source venv/bin/activate
uvicorn main:app --host 0.0.0.0 --port 8001 --reload
```

---

## Step 2 — New database table

Add this to a new migration file `server/migrations/phase6.sql`:

```sql
CREATE TABLE IF NOT EXISTS version_diffs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id     UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  old_version_id  UUID NOT NULL REFERENCES versions(id) ON DELETE CASCADE,
  new_version_id  UUID NOT NULL REFERENCES versions(id) ON DELETE CASCADE,
  change_map      JSONB NOT NULL,     -- full list of change objects
  total_changes   INTEGER DEFAULT 0,
  added_count     INTEGER DEFAULT 0,
  removed_count   INTEGER DEFAULT 0,
  modified_count  INTEGER DEFAULT 0,
  computed_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(old_version_id, new_version_id)
);

CREATE INDEX IF NOT EXISTS idx_vdiffs_document ON version_diffs(document_id);
CREATE INDEX IF NOT EXISTS idx_vdiffs_new_version ON version_diffs(new_version_id);
```

Run it:

```bash
psql -U postgres -d livepdf -f server/migrations/phase6.sql
```

---

## Step 3 — New files to create

### Python microservice

```
python/
├── main.py              ← FastAPI app, single /diff endpoint
├── extractor.py         ← PyMuPDF text block extraction
├── comparator.py        ← difflib sequence matching and classification
├── scorer.py            ← importance scoring (Low / High / Critical)
├── requirements.txt     ← pip dependencies
└── .env                 ← AWS credentials + port
```

### Backend files

```
server/src/
├── services/
│   └── diffService.js   ← calls Python microservice, stores result in DB
└── controllers/
    └── documentController.js  ← UPDATED: trigger diff after version upload
```

### Frontend files

```
client/src/
├── components/
│   ├── DiffOverlay.jsx       ← colored rectangles drawn on top of PDF canvas
│   ├── DiffTooltip.jsx       ← old vs new text popup on highlight click
│   ├── DiffPanel.jsx         ← right-side panel listing all changes
│   └── ChangeBadge.jsx       ← Low / High / Critical badge component
└── hooks/
    └── useDiff.js            ← receives diff via socket, manages overlay state
```

---

## Step 4 — Python microservice code

### requirements.txt

```
fastapi==0.104.1
uvicorn==0.24.0
pymupdf==1.23.6
boto3==1.29.6
python-dotenv==1.0.0
```

---

### extractor.py — text block extraction with PyMuPDF

```python
import fitz   # PyMuPDF
import boto3
import os
import io
from dotenv import load_dotenv

load_dotenv()

s3 = boto3.client(
    's3',
    region_name=os.getenv('AWS_REGION'),
    aws_access_key_id=os.getenv('AWS_ACCESS_KEY_ID'),
    aws_secret_access_key=os.getenv('AWS_SECRET_ACCESS_KEY'),
)

def download_pdf_from_s3(s3_key: str) -> bytes:
    """Download a PDF from S3 and return raw bytes."""
    response = s3.get_object(
        Bucket=os.getenv('S3_BUCKET_NAME'),
        Key=s3_key,
    )
    return response['Body'].read()


def extract_blocks(s3_key: str) -> list[dict]:
    """
    Download a PDF from S3 and extract all text blocks.

    Returns a list of dicts:
    {
        page: int,          # 0-indexed page number
        x0: float,          # left edge in points
        y0: float,          # top edge in points (PDF coordinates — origin bottom-left)
        x1: float,          # right edge
        y1: float,          # bottom edge
        text: str,          # block text content, normalized
        page_height: float, # total page height in points (for coordinate conversion)
        page_width: float,  # total page width in points
    }
    """
    pdf_bytes = download_pdf_from_s3(s3_key)
    doc = fitz.open(stream=pdf_bytes, filetype='pdf')
    blocks = []

    for page_index in range(len(doc)):
        page = doc[page_index]
        page_rect = page.rect
        raw_blocks = page.get_text('blocks')  # returns list of tuples

        for block in raw_blocks:
            x0, y0, x1, y1, text, block_no, block_type = block

            # Skip image blocks (type 1) and empty text blocks
            if block_type != 0:
                continue
            text = text.strip()
            if not text:
                continue

            blocks.append({
                'page': page_index,
                'x0': round(x0, 2),
                'y0': round(y0, 2),
                'x1': round(x1, 2),
                'y1': round(y1, 2),
                'text': text,
                'page_height': round(page_rect.height, 2),
                'page_width': round(page_rect.width, 2),
            })

    doc.close()
    return blocks


def merge_adjacent_blocks(blocks: list[dict], threshold: float = 5.0) -> list[dict]:
    """
    Merge text blocks that are on the same page and vertically adjacent
    within `threshold` points. This handles paragraphs split across
    multiple raw blocks due to font changes or layout differences.
    """
    if not blocks:
        return blocks

    merged = []
    current = blocks[0].copy()

    for block in blocks[1:]:
        same_page = block['page'] == current['page']
        vertically_close = abs(block['y0'] - current['y1']) <= threshold
        same_column = abs(block['x0'] - current['x0']) <= 20.0

        if same_page and vertically_close and same_column:
            # Merge into current
            current['text'] += ' ' + block['text']
            current['y1'] = block['y1']
            current['x0'] = min(current['x0'], block['x0'])
            current['x1'] = max(current['x1'], block['x1'])
        else:
            merged.append(current)
            current = block.copy()

    merged.append(current)
    return merged
```

---

### comparator.py — difflib comparison and classification

```python
from difflib import SequenceMatcher
from extractor import extract_blocks, merge_adjacent_blocks


def compute_diff(old_s3_key: str, new_s3_key: str) -> list[dict]:
    """
    Compare two PDFs and return a list of change objects.

    Each change object:
    {
        type: 'ADDED' | 'REMOVED' | 'MODIFIED',
        page: int,
        x0, y0, x1, y1: float,       # coordinates (use new version for ADDED/MODIFIED,
                                       #              old version for REMOVED)
        old_text: str | None,
        new_text: str | None,
        page_height: float,           # needed by frontend for coordinate conversion
        page_width: float,
    }
    """
    # Extract and merge blocks from both versions
    old_blocks = merge_adjacent_blocks(extract_blocks(old_s3_key))
    new_blocks = merge_adjacent_blocks(extract_blocks(new_s3_key))

    old_texts = [b['text'] for b in old_blocks]
    new_texts = [b['text'] for b in new_blocks]

    # Run sequence matcher on text content
    matcher = SequenceMatcher(
        isjunk=None,
        a=old_texts,
        b=new_texts,
        autojunk=False,   # disable auto-junk heuristic for accuracy
    )

    changes = []

    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == 'equal':
            continue   # no change — skip

        elif tag == 'delete':
            # Blocks exist in old version but not new — REMOVED
            for idx in range(i1, i2):
                block = old_blocks[idx]
                changes.append({
                    'type': 'REMOVED',
                    'page': block['page'],
                    'x0': block['x0'],
                    'y0': block['y0'],
                    'x1': block['x1'],
                    'y1': block['y1'],
                    'old_text': block['text'],
                    'new_text': None,
                    'page_height': block['page_height'],
                    'page_width': block['page_width'],
                })

        elif tag == 'insert':
            # Blocks exist in new version but not old — ADDED
            for idx in range(j1, j2):
                block = new_blocks[idx]
                changes.append({
                    'type': 'ADDED',
                    'page': block['page'],
                    'x0': block['x0'],
                    'y0': block['y0'],
                    'x1': block['x1'],
                    'y1': block['y1'],
                    'old_text': None,
                    'new_text': block['text'],
                    'page_height': block['page_height'],
                    'page_width': block['page_width'],
                })

        elif tag == 'replace':
            # Blocks differ between versions — MODIFIED
            # Pair old and new blocks as best we can
            old_range = old_blocks[i1:i2]
            new_range = new_blocks[j1:j2]
            pairs = zip(old_range, new_range)

            for old_block, new_block in pairs:
                changes.append({
                    'type': 'MODIFIED',
                    'page': new_block['page'],
                    'x0': new_block['x0'],
                    'y0': new_block['y0'],
                    'x1': new_block['x1'],
                    'y1': new_block['y1'],
                    'old_text': old_block['text'],
                    'new_text': new_block['text'],
                    'page_height': new_block['page_height'],
                    'page_width': new_block['page_width'],
                })

            # Handle unequal range sizes — remaining unpaired blocks
            if len(old_range) > len(new_range):
                for block in old_range[len(new_range):]:
                    changes.append({
                        'type': 'REMOVED',
                        'page': block['page'],
                        'x0': block['x0'], 'y0': block['y0'],
                        'x1': block['x1'], 'y1': block['y1'],
                        'old_text': block['text'], 'new_text': None,
                        'page_height': block['page_height'],
                        'page_width': block['page_width'],
                    })
            elif len(new_range) > len(old_range):
                for block in new_range[len(old_range):]:
                    changes.append({
                        'type': 'ADDED',
                        'page': block['page'],
                        'x0': block['x0'], 'y0': block['y0'],
                        'x1': block['x1'], 'y1': block['y1'],
                        'old_text': None, 'new_text': block['text'],
                        'page_height': block['page_height'],
                        'page_width': block['page_width'],
                    })

    # Sort by page then vertical position for consistent ordering
    changes.sort(key=lambda c: (c['page'], c['y0']))
    return changes
```

---

### scorer.py — importance scoring

```python
import re

# Keywords that suggest a HIGH importance change (numbers, dates, money)
HIGH_PATTERNS = [
    r'\d+',                    # any number
    r'\d{1,2}[/-]\d{1,2}[/-]\d{2,4}',   # date format
    r'[₹$€£¥]\s*[\d,]+',      # currency
    r'\d+\.?\d*\s*%',          # percentage
    r'\b(january|february|march|april|may|june|july|august|'
    r'september|october|november|december)\b',
]

# Keywords that suggest a CRITICAL importance change (legal/contract terms)
CRITICAL_KEYWORDS = [
    'termination', 'terminate', 'penalty', 'penalise', 'liable', 'liability',
    'expiry', 'expire', 'expires', 'payment', 'refund', 'warranty', 'warrants',
    'indemnify', 'indemnification', 'breach', 'damages', 'arbitration',
    'jurisdiction', 'governing law', 'confidential', 'non-disclosure',
    'intellectual property', 'force majeure', 'cancellation',
]


def score_change(change: dict) -> str:
    """
    Return 'Low', 'High', or 'Critical' for a change object.
    Checks both old_text and new_text.
    """
    texts = ' '.join(filter(None, [
        change.get('old_text', '') or '',
        change.get('new_text', '') or '',
    ])).lower()

    # Critical check first — highest priority
    for keyword in CRITICAL_KEYWORDS:
        if keyword in texts:
            return 'Critical'

    # High check — contains numbers, dates, or money
    for pattern in HIGH_PATTERNS:
        if re.search(pattern, texts, re.IGNORECASE):
            return 'High'

    # Default — minor wording change
    return 'Low'


def score_all_changes(changes: list[dict]) -> list[dict]:
    """Add an 'importance' field to every change object."""
    for change in changes:
        change['importance'] = score_change(change)
    return changes
```

---

### main.py — FastAPI app

```python
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from comparator import compute_diff
from scorer import score_all_changes
import uvicorn
import os
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title='LivePDF Diff Engine', version='1.0.0')


class DiffRequest(BaseModel):
    old_s3_key: str
    new_s3_key: str


class DiffResponse(BaseModel):
    changes: list[dict]
    total_changes: int
    added_count: int
    removed_count: int
    modified_count: int


@app.get('/health')
def health():
    return {'status': 'ok', 'service': 'livepdf-diff-engine'}


@app.post('/diff', response_model=DiffResponse)
def run_diff(body: DiffRequest):
    try:
        changes = compute_diff(body.old_s3_key, body.new_s3_key)
        changes = score_all_changes(changes)

        return DiffResponse(
            changes=changes,
            total_changes=len(changes),
            added_count=sum(1 for c in changes if c['type'] == 'ADDED'),
            removed_count=sum(1 for c in changes if c['type'] == 'REMOVED'),
            modified_count=sum(1 for c in changes if c['type'] == 'MODIFIED'),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == '__main__':
    uvicorn.run('main:app', host='0.0.0.0', port=int(os.getenv('PORT', 8001)), reload=True)
```

---

## Step 5 — Node.js diffService.js

```js
const axios = require('axios');
const pool = require('../config/db');
const { emitDocUpdated } = require('../socket');

const DIFF_SERVICE_URL = process.env.DIFF_SERVICE_URL || 'http://localhost:8001';

async function computeAndStoreDiff(documentId, oldVersion, newVersion) {
  try {
    // Call the Python microservice
    const response = await axios.post(`${DIFF_SERVICE_URL}/diff`, {
      old_s3_key: oldVersion.s3_key,
      new_s3_key: newVersion.s3_key,
    }, { timeout: 60000 });  // 60s timeout for large PDFs

    const { changes, total_changes, added_count, removed_count, modified_count } =
      response.data;

    // Store in version_diffs table
    await pool.query(
      `INSERT INTO version_diffs
        (document_id, old_version_id, new_version_id, change_map,
         total_changes, added_count, removed_count, modified_count)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (old_version_id, new_version_id) DO UPDATE
         SET change_map = EXCLUDED.change_map,
             total_changes = EXCLUDED.total_changes,
             computed_at = NOW()`,
      [documentId, oldVersion.id, newVersion.id,
       JSON.stringify(changes), total_changes,
       added_count, removed_count, modified_count]
    );

    // Emit diff:ready event to all open viewers of this document
    emitDocUpdated(documentId, {
      type: 'diff:ready',
      changeMap: changes,
      totalChanges: total_changes,
      addedCount: added_count,
      removedCount: removed_count,
      modifiedCount: modified_count,
      oldVersionId: oldVersion.id,
      newVersionId: newVersion.id,
    });

    console.log(`Diff computed for doc ${documentId}: ${total_changes} changes`);
  } catch (err) {
    // Diff failure is non-fatal — the document still uploaded successfully
    console.error('Diff computation failed:', err.message);
  }
}

async function getDiff(oldVersionId, newVersionId) {
  const result = await pool.query(
    `SELECT change_map, total_changes, added_count, removed_count, modified_count,
            computed_at
     FROM version_diffs
     WHERE old_version_id = $1 AND new_version_id = $2`,
    [oldVersionId, newVersionId]
  );

  return result.rows[0] || null;
}

module.exports = { computeAndStoreDiff, getDiff };
```

---

## Step 6 — Updated documentController.js

After saving the new version to the database, add this block at the end of
`uploadNewVersion`:

```js
const { computeAndStoreDiff } = require('../services/diffService');

// Inside uploadNewVersion, after emitDocUpdated from Phase 5:

// Fetch the previous version's S3 key for the diff
const prevVersionResult = await pool.query(
  `SELECT id, s3_key FROM versions
   WHERE document_id = $1 AND version_number = $2`,
  [documentId, newVersionNumber - 1]
);

if (prevVersionResult.rows.length > 0) {
  const oldVersion = prevVersionResult.rows[0];
  const newVersion = { id: newVersionId, s3_key: newS3Key };

  // Run diff asynchronously — do NOT await
  // Upload response returns immediately, diff computes in background
  computeAndStoreDiff(documentId, oldVersion, newVersion).catch(console.error);
}
```

Also add a new endpoint to `documents.js` routes to fetch a stored diff:

```js
// In routes/documents.js
router.get('/:id/diff', auth, ctrl.getVersionDiff);
```

```js
// In controllers/documentController.js
async function getVersionDiff(req, res) {
  const { oldVersionId, newVersionId } = req.query;
  const { getDiff } = require('../services/diffService');

  const diff = await getDiff(oldVersionId, newVersionId);
  if (!diff) {
    return res.status(404).json({ error: 'Diff not computed yet or not found' });
  }

  res.json(diff);
}
```

Add `DIFF_SERVICE_URL` to `server/.env`:

```env
DIFF_SERVICE_URL=http://localhost:8001
```

---

## Step 7 — Frontend code walkthrough

### useDiff.js — manages diff state from socket events

```js
import { useState, useEffect } from 'react';

export default function useDiff(socket) {
  const [changeMap, setChangeMap] = useState([]);
  const [diffStats, setDiffStats] = useState(null);
  const [diffReady, setDiffReady] = useState(false);

  useEffect(() => {
    if (!socket) return;

    socket.on('diff:ready', (payload) => {
      setChangeMap(payload.changeMap);
      setDiffStats({
        total: payload.totalChanges,
        added: payload.addedCount,
        removed: payload.removedCount,
        modified: payload.modifiedCount,
      });
      setDiffReady(true);
    });

    return () => socket.off('diff:ready');
  }, [socket]);

  // Filter changes for a specific page
  function getChangesForPage(pageIndex) {
    return changeMap.filter(c => c.page === pageIndex);
  }

  return { changeMap, diffStats, diffReady, getChangesForPage };
}
```

---

### DiffOverlay.jsx — colored rectangles on the PDF

```jsx
import { useState } from 'react';
import DiffTooltip from './DiffTooltip';

const TYPE_COLORS = {
  ADDED:    { bg: 'rgba(34,197,94,0.15)',  border: '#22c55e' },
  REMOVED:  { bg: 'rgba(239,68,68,0.15)',  border: '#ef4444' },
  MODIFIED: { bg: 'rgba(245,158,11,0.15)', border: '#f59e0b' },
};

export default function DiffOverlay({ changes, scale, pageHeight }) {
  const [activeChange, setActiveChange] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  function handleClick(e, change) {
    e.stopPropagation();
    setActiveChange(change);
    setTooltipPos({ x: e.clientX, y: e.clientY });
  }

  // PDF coordinates: origin bottom-left, y increases upward
  // Screen coordinates: origin top-left, y increases downward
  // Conversion: screen_y = (page_height - pdf_y1) * scale
  function toScreenRect(change) {
    return {
      left:   change.x0 * scale,
      top:    (pageHeight - change.y1) * scale,
      width:  (change.x1 - change.x0) * scale,
      height: (change.y1 - change.y0) * scale,
    };
  }

  return (
    <>
      <div
        style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
        onClick={() => setActiveChange(null)}
      >
        {changes.map((change, i) => {
          const rect = toScreenRect(change);
          const colors = TYPE_COLORS[change.type];
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: rect.left,
                top: rect.top,
                width: rect.width,
                height: rect.height,
                background: colors.bg,
                border: `1.5px solid ${colors.border}`,
                borderRadius: 2,
                cursor: 'pointer',
                pointerEvents: 'auto',
                zIndex: 10,
              }}
              onClick={(e) => handleClick(e, change)}
            />
          );
        })}
      </div>

      {activeChange && (
        <DiffTooltip
          change={activeChange}
          position={tooltipPos}
          onClose={() => setActiveChange(null)}
        />
      )}
    </>
  );
}
```

---

### DiffTooltip.jsx — old vs new text popup

```jsx
import ChangeBadge from './ChangeBadge';

export default function DiffTooltip({ change, position, onClose }) {
  return (
    <div style={{ ...styles.tooltip, left: position.x + 12, top: position.y - 8 }}>
      <div style={styles.header}>
        <ChangeBadge type={change.type} />
        <ChangeBadge importance={change.importance} />
        <button style={styles.close} onClick={onClose}>✕</button>
      </div>

      <div style={styles.content}>
        {change.type === 'MODIFIED' && (
          <div style={styles.compare}>
            <div style={styles.oldBox}>
              <span style={styles.oldLabel}>Before</span>
              <p style={styles.text}>{change.old_text}</p>
            </div>
            <div style={styles.arrow}>→</div>
            <div style={styles.newBox}>
              <span style={styles.newLabel}>After</span>
              <p style={styles.text}>{change.new_text}</p>
            </div>
          </div>
        )}

        {change.type === 'ADDED' && (
          <div style={styles.newBox}>
            <span style={styles.newLabel}>Added</span>
            <p style={styles.text}>{change.new_text}</p>
          </div>
        )}

        {change.type === 'REMOVED' && (
          <div style={styles.oldBox}>
            <span style={styles.oldLabel}>Removed</span>
            <p style={styles.text}>{change.old_text}</p>
          </div>
        )}
      </div>

      <div style={styles.footer}>Page {change.page + 1}</div>
    </div>
  );
}

const styles = {
  tooltip: {
    position: 'fixed', zIndex: 200,
    background: '#fff', border: '0.5px solid #e0e0e0',
    borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
    padding: '12px', maxWidth: 420, minWidth: 260,
  },
  header: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 },
  close: { marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#aaa', fontSize: 14 },
  content: {},
  compare: { display: 'flex', gap: 8, alignItems: 'flex-start' },
  arrow: { fontSize: 18, color: '#888', paddingTop: 18 },
  oldBox: { flex: 1, background: '#fff5f5', borderRadius: 6, padding: '8px 10px' },
  newBox: { flex: 1, background: '#f0fdf4', borderRadius: 6, padding: '8px 10px' },
  oldLabel: { fontSize: 10, fontWeight: 600, color: '#ef4444', textTransform: 'uppercase', display: 'block', marginBottom: 4 },
  newLabel: { fontSize: 10, fontWeight: 600, color: '#22c55e', textTransform: 'uppercase', display: 'block', marginBottom: 4 },
  text: { fontSize: 13, color: '#1a1a1a', lineHeight: 1.5, margin: 0 },
  footer: { fontSize: 11, color: '#aaa', marginTop: 8, textAlign: 'right' },
};
```

---

### ChangeBadge.jsx

```jsx
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
    }}>
      {style.label}
    </span>
  );
}
```

---

### DiffPanel.jsx — right-side change list

```jsx
import ChangeBadge from './ChangeBadge';

export default function DiffPanel({ changeMap, diffStats, onChangeClick, visible }) {
  if (!visible) return null;

  return (
    <div style={styles.panel}>
      <div style={styles.header}>
        <span style={styles.title}>Changes</span>
        {diffStats && (
          <div style={styles.stats}>
            <span style={{ color: '#22c55e' }}>+{diffStats.added}</span>
            <span style={{ color: '#ef4444' }}>−{diffStats.removed}</span>
            <span style={{ color: '#f59e0b' }}>~{diffStats.modified}</span>
          </div>
        )}
      </div>

      {changeMap.length === 0 && (
        <p style={styles.empty}>No changes detected or diff not yet computed.</p>
      )}

      <ul style={styles.list}>
        {changeMap.map((change, i) => (
          <li
            key={i}
            style={styles.item}
            onClick={() => onChangeClick(change)}
          >
            <div style={styles.itemHeader}>
              <ChangeBadge type={change.type} />
              <ChangeBadge importance={change.importance} />
              <span style={styles.page}>p.{change.page + 1}</span>
            </div>
            <p style={styles.excerpt}>
              {(change.new_text || change.old_text || '').slice(0, 80)}
              {(change.new_text || change.old_text || '').length > 80 ? '…' : ''}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

const styles = {
  panel: { width: 280, borderLeft: '0.5px solid #e0e0e0', background: '#fff', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  header: { padding: '12px 14px', borderBottom: '0.5px solid #e0e0e0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 13, fontWeight: 500, color: '#1a1a1a' },
  stats: { display: 'flex', gap: 8, fontSize: 12, fontWeight: 500 },
  list: { listStyle: 'none', overflow: 'auto', flex: 1, padding: '6px 0' },
  item: { padding: '10px 14px', cursor: 'pointer', borderBottom: '0.5px solid #f0f0f0' },
  itemHeader: { display: 'flex', gap: 5, alignItems: 'center', marginBottom: 4 },
  page: { fontSize: 11, color: '#aaa', marginLeft: 'auto' },
  excerpt: { fontSize: 12, color: '#555', lineHeight: 1.4, margin: 0 },
  empty: { padding: '2rem 1rem', fontSize: 13, color: '#aaa', textAlign: 'center' },
};
```

---

### Updated PdfViewer.jsx — add overlay and diff panel

```jsx
// Add imports
import DiffOverlay from './DiffOverlay';
import DiffPanel from './DiffPanel';
import useDiff from '../hooks/useDiff';

// Add prop
export default function PdfViewer({ url, title, allowDownload, socket }) {

  // Add inside PdfViewer
  const { changeMap, diffStats, diffReady, getChangesForPage } = useDiff(socket);
  const [showDiffPanel, setShowDiffPanel] = useState(false);
  const [pageHeight, setPageHeight] = useState(792); // default Letter height in pts

  // In onLoadSuccess, capture the page height:
  function onLoadSuccess({ numPages }) {
    // ... existing code ...
  }

  // Wrap the Page component in a relative container and add the overlay:
  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '1rem', background: '#f0f0f0' }}>
        <div style={{ position: 'relative', display: 'inline-block' }}>
          <Document file={url} onLoadSuccess={onLoadSuccess} onLoadError={onLoadError}>
            <Page
              pageNumber={pageNumber}
              scale={scale}
              renderTextLayer={true}
              renderAnnotationLayer={false}
              onRenderSuccess={(page) => setPageHeight(page.height / scale)}
            />
          </Document>

          {diffReady && (
            <DiffOverlay
              changes={getChangesForPage(pageNumber - 1)}
              scale={scale}
              pageHeight={pageHeight}
            />
          )}
        </div>
      </div>

      {diffReady && (
        <DiffPanel
          changeMap={changeMap}
          diffStats={diffStats}
          visible={showDiffPanel}
          onChangeClick={(change) => setPageNumber(change.page + 1)}
        />
      )}
    </div>
  );
}
```

---

## API changes in Phase 6

### New endpoint: GET /api/documents/:id/diff

```
Query params: oldVersionId, newVersionId
Auth: JWT required
```

Response:
```json
{
  "changeMap": [...],
  "totalChanges": 4,
  "addedCount": 1,
  "removedCount": 0,
  "modifiedCount": 3,
  "computedAt": "2026-01-15T10:30:00Z"
}
```

### New Socket.IO event: diff:ready (server → client)

```json
{
  "type": "diff:ready",
  "changeMap": [...],
  "totalChanges": 4,
  "addedCount": 1,
  "removedCount": 0,
  "modifiedCount": 3,
  "oldVersionId": "uuid",
  "newVersionId": "uuid"
}
```

---

## Complete file structure after Phase 6

```
livepdf/
├── python/                        ← NEW service
│   ├── main.py
│   ├── extractor.py
│   ├── comparator.py
│   ├── scorer.py
│   ├── requirements.txt
│   └── .env
│
├── server/
│   ├── src/
│   │   ├── index.js
│   │   ├── socket.js
│   │   ├── config/
│   │   │   ├── db.js
│   │   │   └── s3.js
│   │   ├── middleware/
│   │   │   ├── auth.js
│   │   │   └── upload.js
│   │   ├── services/
│   │   │   └── diffService.js     ← NEW
│   │   ├── controllers/
│   │   │   ├── authController.js
│   │   │   ├── documentController.js ← UPDATED
│   │   │   └── shareController.js
│   │   └── routes/
│   │       ├── auth.js
│   │       ├── documents.js       ← UPDATED (add /diff endpoint)
│   │       └── share.js
│   └── migrations/
│       ├── schema.sql
│       ├── run.js
│       ├── phase3.sql
│       └── phase6.sql             ← NEW
│
└── client/
    └── src/
        ├── hooks/
        │   ├── usePdfSearch.js
        │   ├── useSocket.js
        │   ├── useSignedUrlRefresh.js
        │   └── useDiff.js         ← NEW
        ├── components/
        │   ├── PdfViewer.jsx      ← UPDATED (overlay + diff panel)
        │   ├── PdfToolbar.jsx
        │   ├── SearchBar.jsx
        │   ├── PreviewModal.jsx
        │   ├── ConnectionStatus.jsx
        │   ├── ViewerToast.jsx
        │   ├── DiffOverlay.jsx    ← NEW
        │   ├── DiffTooltip.jsx    ← NEW
        │   ├── DiffPanel.jsx      ← NEW
        │   └── ChangeBadge.jsx    ← NEW
        └── pages/
            └── Viewer.jsx         ← UPDATED (pass socket to PdfViewer)
```

---

## How to test Phase 6

### Start all three services

```bash
# Terminal 1 — Node.js backend
cd server && npm run dev

# Terminal 2 — Python diff engine
cd python && source venv/bin/activate && uvicorn main:app --port 8001 --reload

# Terminal 3 — React frontend
cd client && npm run dev
```

### Test the Python service directly

```bash
# Health check
curl http://localhost:8001/health

# Test diff endpoint with real S3 keys
curl -X POST http://localhost:8001/diff \
  -H "Content-Type: application/json" \
  -d '{"old_s3_key": "userid/docid/v1.pdf", "new_s3_key": "userid/docid/v2.pdf"}'
```

Expected response:
```json
{
  "changes": [
    {
      "type": "MODIFIED",
      "page": 0,
      "x0": 72.0, "y0": 200.0, "x1": 540.0, "y1": 215.0,
      "old_text": "Meeting at 10 AM",
      "new_text": "Meeting at 11 AM",
      "page_height": 792.0,
      "page_width": 612.0,
      "importance": "Low"
    }
  ],
  "total_changes": 1,
  "added_count": 0,
  "removed_count": 0,
  "modified_count": 1
}
```

### Test the full flow

1. Open a share link in a browser window
2. In the dashboard, upload a new version of the document
3. The PDF updates (Phase 5's real-time sync)
4. Within a few seconds, colored overlays appear on changed sections
5. Click an amber overlay — tooltip shows old text on left, new text on right
6. The diff panel on the right lists all changes with page numbers
7. Click a change in the panel — viewer jumps to that page

### Test importance scoring

Upload a new version where you change a number (price, date, or percentage).
That change should appear with a "High" badge.
Upload a version containing the word "termination" or "penalty" — that change
should appear with a "⚠ Critical" badge.

---

## Common errors and fixes

| Error | Cause | Fix |
|---|---|---|
| `Connection refused` on port 8001 | Python service not started | Run `uvicorn main:app --port 8001` in the python/ folder |
| `ModuleNotFoundError: fitz` | PyMuPDF not installed | Run `pip install pymupdf` inside the virtual environment |
| Overlays appear in wrong position | Coordinate conversion bug | Log `pageHeight`, `scale`, and raw coordinates — check the `(pageHeight - y1) * scale` formula |
| No overlays appear at all | `diff:ready` event not received | Check browser console — add `socket.on('diff:ready', console.log)` temporarily |
| Diff takes too long (timeout) | Large PDF with many pages | Increase `timeout` in diffService.js axios call to 120000 (2 min) |
| `NoSuchKey` from S3 in Python | Wrong S3 key passed | Log the keys in diffService.js before sending to Python |
| All changes show `importance: Low` | Scorer patterns not matching | Test `scorer.py` independently with sample text containing numbers |

---

## Performance optimizations built in

**Page hash skip** — before running the full block comparison, compute a hash of
each page's full text. Skip pages where the hash is identical between versions.
For documents where only one page changed, this reduces computation time
dramatically.

```python
import hashlib

def page_hash(page) -> str:
    text = page.get_text('text')
    return hashlib.md5(text.encode()).hexdigest()
```

**Result cached in DB** — `computeAndStoreDiff` uses `ON CONFLICT DO UPDATE`
so the diff is never computed twice for the same version pair.

**Non-blocking in Node.js** — `computeAndStoreDiff` is called with `.catch()`
and no `await`, so the upload API response returns immediately and the diff
runs in the background.

---

## What's next — Phase 7

Phase 7 adds AI features on top of the diff engine:

- AI change summary: feed changed blocks into Claude API to generate a
  plain-English explanation of what changed and why it matters
- Risk classification: AI upgrades the scorer from rule-based to LLM-powered
  for more accurate Critical/High/Low classification
- PDF Q&A: RAG pipeline using pgvector embeddings lets users ask questions
  about the document and get answers referencing specific pages
