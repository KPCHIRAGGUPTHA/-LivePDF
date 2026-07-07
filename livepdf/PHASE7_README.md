# LivePDF — Phase 7: AI Features

## What Phase 7 adds

Phase 7 adds three distinct AI features on top of the diff engine from Phase 6:

1. **AI Change Summary** — Claude writes a plain-English paragraph explaining
   what changed between two versions, displayed at the top of the diff panel
2. **AI Risk Classification** — upgrades Phase 6's rule-based scorer to
   LLM-powered analysis with a reason for each classification
3. **PDF Q&A (RAG)** — users ask questions about document content in natural
   language and get accurate, page-referenced answers via retrieval augmented
   generation

All AI calls are made server-side. The frontend never sees the API key.
Every response is cached in the database so the same computation is never paid
for twice.

---

## Prerequisites

- Phases 1–6 fully working
- Python microservice from Phase 6 running on port 8001
- Phase 6's `version_diffs` table and `change_map` JSONB working
- PostgreSQL with pgvector extension available

---

## Step 1 — Install new dependencies

### Backend

```bash
cd server
npm install @anthropic-ai/sdk openai axios
```

We use:
- `@anthropic-ai/sdk` — for change summary, risk classification, and Q&A (Claude)
- `openai` — for embeddings only (text-embedding-3-small)
- `axios` — already installed, used to call Python service

### Frontend

No new npm packages. Streaming is handled with the browser's native `fetch` API.

---

## Step 2 — Environment variables

Add to `server/.env`:

```env
# Anthropic (Claude) — for summaries, risk classification, Q&A
ANTHROPIC_API_KEY=your_anthropic_api_key_here

# OpenAI — for embeddings only (text-embedding-3-small)
OPENAI_API_KEY=your_openai_api_key_here

# AI model settings
CLAUDE_MODEL=claude-sonnet-4-6
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_DIMENSIONS=1536
MAX_CHUNKS_PER_DOC=200
CHUNK_SIZE_TOKENS=500
CHUNK_OVERLAP_TOKENS=50
```

---

## Step 3 — pgvector setup

pgvector adds a vector data type and similarity search to PostgreSQL.

### Install pgvector

```bash
# Ubuntu / Debian
sudo apt install postgresql-15-pgvector

# Mac with Homebrew
brew install pgvector

# Or build from source:
# https://github.com/pgvector/pgvector#installation
```

### Enable in your database

```bash
psql -U postgres -d livepdf -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

Verify it worked:
```bash
psql -U postgres -d livepdf -c "\dx"
# Should show: vector | ... | vector similarity search
```

---

## Step 4 — New database tables

Create `server/migrations/phase7.sql`:

```sql
-- Enable pgvector if not already done
CREATE EXTENSION IF NOT EXISTS vector;

-- ─────────────────────────────────────────────────────────────
-- EMBEDDINGS — one row per text chunk per document version
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS embeddings (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id   UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  version_id    UUID NOT NULL REFERENCES versions(id) ON DELETE CASCADE,
  chunk_index   INTEGER NOT NULL,       -- position within the document
  chunk_text    TEXT NOT NULL,          -- the raw text of this chunk
  page_number   INTEGER NOT NULL,       -- which page this chunk came from (0-indexed)
  embedding     vector(1536),           -- OpenAI text-embedding-3-small output
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(version_id, chunk_index)
);

-- ivfflat index for fast approximate nearest-neighbour search
-- lists = sqrt(number of rows) — set to 100 as a starting point
CREATE INDEX IF NOT EXISTS idx_embeddings_vector
  ON embeddings USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

CREATE INDEX IF NOT EXISTS idx_embeddings_version
  ON embeddings(version_id);

CREATE INDEX IF NOT EXISTS idx_embeddings_document
  ON embeddings(document_id);

-- ─────────────────────────────────────────────────────────────
-- AI SUMMARIES — cached Claude responses for change summaries
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_summaries (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  version_diff_id UUID NOT NULL REFERENCES version_diffs(id) ON DELETE CASCADE,
  summary_text    TEXT NOT NULL,
  model_used      VARCHAR(100),
  prompt_tokens   INTEGER,
  completion_tokens INTEGER,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(version_diff_id)
);

-- ─────────────────────────────────────────────────────────────
-- QA CACHE — cached Q&A answers to avoid duplicate API calls
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS qa_cache (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id     UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  version_id      UUID NOT NULL REFERENCES versions(id) ON DELETE CASCADE,
  question_hash   VARCHAR(64) NOT NULL,   -- SHA-256 of question + chunk IDs
  question_text   TEXT NOT NULL,
  answer_text     TEXT NOT NULL,
  page_refs       INTEGER[],              -- pages referenced in the answer
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(version_id, question_hash)
);

CREATE INDEX IF NOT EXISTS idx_qa_cache_version ON qa_cache(version_id);
```

Run it:

```bash
psql -U postgres -d livepdf -f server/migrations/phase7.sql
```

---

## Step 5 — New files to create

### Backend

```
server/src/
├── services/
│   ├── aiService.js        ← change summary + risk classification (Claude)
│   ├── embeddingService.js ← chunk, embed, store, and search (OpenAI + pgvector)
│   └── qaService.js        ← Q&A orchestration (retrieve + Claude + cache)
└── routes/
    └── qa.js               ← POST /api/qa/:token (question endpoint)
```

### Frontend

```
client/src/
├── components/
│   ├── AiSummaryCard.jsx   ← summary card shown at top of diff panel
│   ├── ChatPanel.jsx       ← Q&A chat interface (tab in the right panel)
│   ├── ChatMessage.jsx     ← individual message bubble with page refs
│   └── StreamingText.jsx   ← text that renders token by token
└── hooks/
    └── useChat.js          ← chat state, send message, handle streaming
```

### Updated files

```
server/src/
├── services/
│   └── diffService.js      ← UPDATED: trigger AI summary after diff completes
└── controllers/
    └── documentController.js ← UPDATED: trigger embeddings after upload

client/src/
└── components/
    └── DiffPanel.jsx       ← UPDATED: add tabs (Diff / Chat), AiSummaryCard
```

---

## Step 6 — Backend code walkthrough

### aiService.js — change summary and risk classification

```js
const Anthropic = require('@anthropic-ai/sdk');
const pool = require('../config/db');

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';

// ─── Change Summary ───────────────────────────────────────────

function buildSummaryPrompt(changes, documentTitle) {
  const changeLines = changes
    .slice(0, 50)  // cap at 50 changes to stay within context
    .map((c, i) => {
      const type = c.type;
      const page = c.page + 1;
      const importance = c.importance || 'Low';
      const old = c.old_text ? `"${c.old_text.slice(0, 200)}"` : 'N/A';
      const nw  = c.new_text ? `"${c.new_text.slice(0, 200)}"` : 'N/A';
      return `${i + 1}. [${type}] [${importance}] Page ${page}: ${old} → ${nw}`;
    })
    .join('\n');

  return `You are a document analyst. Below are the changes detected between
two versions of a document titled "${documentTitle || 'Untitled'}".

CHANGES:
${changeLines}

Write a concise plain-English summary (2–5 sentences, under 150 words) of what
changed. Mention page numbers. Highlight Critical and High importance changes
first. Write for a business professional who has not seen the raw diff.
Respond with ONLY the summary paragraph — no preamble, no bullet points.`;
}

async function generateChangeSummary(versionDiffId, changes, documentTitle) {
  // Check cache first
  const cached = await pool.query(
    'SELECT summary_text FROM ai_summaries WHERE version_diff_id = $1',
    [versionDiffId]
  );
  if (cached.rows.length > 0) {
    return cached.rows[0].summary_text;
  }

  if (!changes || changes.length === 0) {
    return 'No changes detected between these versions.';
  }

  const prompt = buildSummaryPrompt(changes, documentTitle);

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 300,
    messages: [{ role: 'user', content: prompt }],
  });

  const summaryText = response.content[0].text.trim();

  // Cache the result
  await pool.query(
    `INSERT INTO ai_summaries
      (version_diff_id, summary_text, model_used, prompt_tokens, completion_tokens)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (version_diff_id) DO NOTHING`,
    [
      versionDiffId, summaryText, MODEL,
      response.usage.input_tokens, response.usage.output_tokens,
    ]
  );

  return summaryText;
}

// ─── Risk Classification ──────────────────────────────────────

function buildRiskPrompt(changes) {
  const items = changes.map((c, i) => ({
    index: i,
    type: c.type,
    page: c.page + 1,
    old_text: (c.old_text || '').slice(0, 300),
    new_text: (c.new_text || '').slice(0, 300),
  }));

  return `You are a legal and business document risk analyst.
Classify the importance of each document change below.

Rules:
- "Critical": changes to legal terms, payment amounts, deadlines, termination
  clauses, liabilities, penalties, or any change with major business impact
- "High": changes to numbers, dates, percentages, names, or facts that are
  meaningful but not immediately dangerous
- "Low": typo fixes, formatting changes, minor wording adjustments

For each change, respond with ONLY a JSON array. No explanation outside JSON.
Each element: { "index": <number>, "importance": "Low"|"High"|"Critical",
                "reason": "<one sentence why>" }

CHANGES:
${JSON.stringify(items, null, 2)}`;
}

async function classifyChanges(changes) {
  if (!changes || changes.length === 0) return changes;

  const prompt = buildRiskPrompt(changes);

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }],
    });

    // Strip markdown code fences if present
    const raw = response.content[0].text
      .replace(/```json|```/g, '')
      .trim();

    const classifications = JSON.parse(raw);

    // Merge AI classifications back into change objects
    const updated = [...changes];
    for (const cls of classifications) {
      if (updated[cls.index]) {
        updated[cls.index].importance = cls.importance;
        updated[cls.index].importance_reason = cls.reason;
      }
    }
    return updated;

  } catch (err) {
    // If AI classification fails, return changes with original importance
    console.error('Risk classification failed:', err.message);
    return changes;
  }
}

module.exports = { generateChangeSummary, classifyChanges };
```

---

### embeddingService.js — chunk, embed, store, search

```js
const { OpenAI } = require('openai');
const pool = require('../config/db');
const crypto = require('crypto');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const CHUNK_SIZE  = parseInt(process.env.CHUNK_SIZE_TOKENS)  || 500;
const OVERLAP     = parseInt(process.env.CHUNK_OVERLAP_TOKENS) || 50;
const MODEL       = process.env.EMBEDDING_MODEL || 'text-embedding-3-small';
const DIMENSIONS  = parseInt(process.env.EMBEDDING_DIMENSIONS) || 1536;

// ─── Text chunking ────────────────────────────────────────────

function chunkText(pages) {
  /**
   * pages: [{ pageNumber: 0, text: '...' }, ...]
   * Returns: [{ chunkIndex, chunkText, pageNumber }]
   *
   * We split by words, keeping chunks near CHUNK_SIZE tokens
   * (approximated as words, since ~0.75 words per token for English).
   */
  const TARGET_WORDS = Math.floor(CHUNK_SIZE * 0.75);
  const OVERLAP_WORDS = Math.floor(OVERLAP * 0.75);

  const chunks = [];
  let chunkIndex = 0;
  let buffer = [];
  let bufferPage = 0;

  for (const { pageNumber, text } of pages) {
    const words = text.split(/\s+/).filter(Boolean);

    for (const word of words) {
      buffer.push(word);

      if (buffer.length >= TARGET_WORDS) {
        chunks.push({
          chunkIndex: chunkIndex++,
          chunkText: buffer.join(' '),
          pageNumber: bufferPage,
        });
        // Keep overlap words for next chunk
        buffer = buffer.slice(-OVERLAP_WORDS);
        bufferPage = pageNumber;
      }
    }
    bufferPage = pageNumber;
  }

  // Last chunk
  if (buffer.length > 0) {
    chunks.push({
      chunkIndex: chunkIndex++,
      chunkText: buffer.join(' '),
      pageNumber: bufferPage,
    });
  }

  return chunks;
}

// ─── Embedding generation ─────────────────────────────────────

async function embedChunks(chunks) {
  // Batch all chunks in one API call (OpenAI allows up to 2048 inputs)
  const texts = chunks.map(c => c.chunkText);

  const response = await openai.embeddings.create({
    model: MODEL,
    input: texts,
    dimensions: DIMENSIONS,
  });

  return chunks.map((chunk, i) => ({
    ...chunk,
    embedding: response.data[i].embedding,
  }));
}

// ─── Store embeddings ─────────────────────────────────────────

async function storeEmbeddings(documentId, versionId, pages) {
  const chunks = chunkText(pages);
  if (chunks.length === 0) return;

  const chunksWithEmbeddings = await embedChunks(chunks);

  // Delete old embeddings for this version (re-upload scenario)
  await pool.query(
    'DELETE FROM embeddings WHERE version_id = $1',
    [versionId]
  );

  // Batch insert — build a single multi-row INSERT
  const values = [];
  const params = [];
  let paramIndex = 1;

  for (const chunk of chunksWithEmbeddings) {
    values.push(
      `($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, ` +
      `$${paramIndex++}, $${paramIndex++}, $${paramIndex++})`
    );
    params.push(
      documentId,
      versionId,
      chunk.chunkIndex,
      chunk.chunkText,
      chunk.pageNumber,
      `[${chunk.embedding.join(',')}]`,  // pgvector format
    );
  }

  await pool.query(
    `INSERT INTO embeddings
      (document_id, version_id, chunk_index, chunk_text, page_number, embedding)
     VALUES ${values.join(', ')}
     ON CONFLICT (version_id, chunk_index) DO UPDATE
       SET chunk_text = EXCLUDED.chunk_text,
           embedding = EXCLUDED.embedding`,
    params
  );

  console.log(`Stored ${chunksWithEmbeddings.length} embeddings for version ${versionId}`);
}

// ─── Similarity search ────────────────────────────────────────

async function findSimilarChunks(questionText, versionId, topK = 5) {
  // Embed the question
  const response = await openai.embeddings.create({
    model: MODEL,
    input: [questionText],
    dimensions: DIMENSIONS,
  });

  const questionEmbedding = response.data[0].embedding;
  const vectorStr = `[${questionEmbedding.join(',')}]`;

  // Cosine similarity search using pgvector <=> operator
  const result = await pool.query(
    `SELECT chunk_index, chunk_text, page_number,
            1 - (embedding <=> $1::vector) AS similarity
     FROM embeddings
     WHERE version_id = $2
     ORDER BY embedding <=> $1::vector
     LIMIT $3`,
    [vectorStr, versionId, topK]
  );

  return result.rows;  // [{ chunk_text, page_number, similarity }]
}

module.exports = { storeEmbeddings, findSimilarChunks, chunkText };
```

---

### qaService.js — Q&A orchestration

```js
const Anthropic = require('@anthropic-ai/sdk');
const pool = require('../config/db');
const crypto = require('crypto');
const { findSimilarChunks } = require('./embeddingService');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';

function buildQaPrompt(question, chunks, documentTitle, conversationHistory) {
  const context = chunks
    .map((c, i) => `[Page ${c.page_number + 1}]\n${c.chunk_text}`)
    .join('\n\n---\n\n');

  return `You are a helpful document assistant for "${documentTitle || 'this document'}".
Answer the user's question using ONLY the document excerpts provided below.
If the answer is not in the excerpts, say: "I could not find information about
this in the document." Do not make up information. When referencing content,
mention the page number.

DOCUMENT EXCERPTS:
${context}

${conversationHistory.length > 0
    ? 'CONVERSATION HISTORY:\n' +
      conversationHistory.map(m => `${m.role}: ${m.content}`).join('\n') + '\n'
    : ''}
USER QUESTION: ${question}`;
}

function makeQuestionHash(question, chunks) {
  const chunkIds = chunks.map(c => c.chunk_index).sort().join(',');
  return crypto
    .createHash('sha256')
    .update(question.toLowerCase().trim() + chunkIds)
    .digest('hex');
}

// Non-streaming Q&A (for cached responses)
async function answerQuestion({ question, versionId, documentId, documentTitle,
                                conversationHistory = [] }) {
  const chunks = await findSimilarChunks(question, versionId);

  if (chunks.length === 0) {
    return {
      answer: 'I could not find any relevant content in this document to answer your question.',
      pageRefs: [],
      cached: false,
    };
  }

  const questionHash = makeQuestionHash(question, chunks);

  // Check cache
  const cached = await pool.query(
    'SELECT answer_text, page_refs FROM qa_cache WHERE version_id = $1 AND question_hash = $2',
    [versionId, questionHash]
  );
  if (cached.rows.length > 0) {
    return {
      answer: cached.rows[0].answer_text,
      pageRefs: cached.rows[0].page_refs,
      cached: true,
    };
  }

  const prompt = buildQaPrompt(question, chunks, documentTitle, conversationHistory);

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 800,
    messages: [{ role: 'user', content: prompt }],
  });

  const answerText = response.content[0].text.trim();
  const pageRefs = [...new Set(chunks.map(c => c.page_number + 1))].sort((a, b) => a - b);

  // Cache the result
  await pool.query(
    `INSERT INTO qa_cache
      (document_id, version_id, question_hash, question_text, answer_text, page_refs)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (version_id, question_hash) DO NOTHING`,
    [documentId, versionId, questionHash, question, answerText, pageRefs]
  );

  return { answer: answerText, pageRefs, cached: false };
}

// Streaming Q&A — yields tokens one by one
async function* answerQuestionStream({ question, versionId, documentTitle,
                                       conversationHistory = [] }) {
  const chunks = await findSimilarChunks(question, versionId);
  const pageRefs = [...new Set(chunks.map(c => c.page_number + 1))].sort((a, b) => a - b);

  // Yield page refs first so the frontend can show them immediately
  yield { type: 'page_refs', pageRefs };

  if (chunks.length === 0) {
    yield { type: 'token', text: 'I could not find any relevant content in this document.' };
    return;
  }

  const prompt = buildQaPrompt(question, chunks, documentTitle, conversationHistory);

  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 800,
    messages: [{ role: 'user', content: prompt }],
  });

  for await (const event of stream) {
    if (event.type === 'content_block_delta' &&
        event.delta.type === 'text_delta') {
      yield { type: 'token', text: event.delta.text };
    }
  }

  yield { type: 'done' };
}

module.exports = { answerQuestion, answerQuestionStream };
```

---

### qa.js — Q&A route with streaming

```js
const router = require('express').Router();
const pool = require('../config/db');
const { answerQuestionStream } = require('../services/qaService');

// POST /api/qa/:token
// Body: { question, conversationHistory }
// Streams the answer as Server-Sent Events
router.post('/:token', async (req, res) => {
  const { token } = req.params;
  const { question, conversationHistory = [] } = req.body;

  if (!question || question.trim().length === 0) {
    return res.status(400).json({ error: 'Question is required' });
  }

  // Resolve token to document
  const linkResult = await pool.query(
    `SELECT sl.document_id, d.title, d.current_version_id
     FROM share_links sl
     JOIN documents d ON d.id = sl.document_id
     WHERE sl.token = $1`,
    [token]
  );

  if (linkResult.rows.length === 0) {
    return res.status(404).json({ error: 'Link not found' });
  }

  const { document_id, title, current_version_id } = linkResult.rows[0];

  // Set up Server-Sent Events
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  try {
    const stream = answerQuestionStream({
      question: question.trim(),
      versionId: current_version_id,
      documentId: document_id,
      documentTitle: title,
      conversationHistory: conversationHistory.slice(-10), // last 10 messages
    });

    for await (const chunk of stream) {
      res.write(`data: ${JSON.stringify(chunk)}\n\n`);
    }
  } catch (err) {
    console.error('Q&A streaming error:', err);
    res.write(`data: ${JSON.stringify({ type: 'error', message: 'AI service error' })}\n\n`);
  } finally {
    res.end();
  }
});

module.exports = router;
```

Register in `index.js`:

```js
const qaRoutes = require('./routes/qa');
app.use('/api/qa', qaRoutes);
```

---

### Updated diffService.js — trigger AI summary after diff

After storing the diff in the database, add:

```js
const { generateChangeSummary, classifyChanges } = require('./aiService');

// Inside computeAndStoreDiff, after storing the diff:

// Run AI classification and summary asynchronously
;(async () => {
  try {
    // 1. Upgrade importance scores with AI
    const aiClassifiedChanges = await classifyChanges(changes);

    // 2. Update the change_map in the DB with AI classifications
    await pool.query(
      'UPDATE version_diffs SET change_map = $1 WHERE id = $2',
      [JSON.stringify(aiClassifiedChanges), diffRowId]
    );

    // 3. Generate and cache the plain-English summary
    const summary = await generateChangeSummary(diffRowId, aiClassifiedChanges, documentTitle);

    // 4. Emit updated diff with summary to open viewers
    emitDocUpdated(documentId, {
      type: 'diff:updated',
      changeMap: aiClassifiedChanges,
      summary,
    });

  } catch (err) {
    console.error('AI enrichment failed:', err.message);
    // Non-fatal — viewers still see the diff without AI enrichment
  }
})();
```

---

### Updated documentController.js — trigger embeddings after upload

After the new version is saved to S3 and PostgreSQL, add:

```js
const { storeEmbeddings } = require('../services/embeddingService');
const pdfParse = require('pdf-parse');

// After saving to DB, trigger embedding generation asynchronously:
;(async () => {
  try {
    // Re-fetch the PDF from S3 to extract text for embeddings
    const s3Object = await s3.send(new GetObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: newS3Key,
    }));

    const pdfBuffer = Buffer.concat(await s3Object.Body.toArray());
    const parsed = await pdfParse(pdfBuffer);

    // pdf-parse gives us full text but not per-page breakdown
    // Split by page break character (\f) as a rough approximation
    const pageTexts = parsed.text.split('\f').map((text, i) => ({
      pageNumber: i,
      text: text.trim(),
    })).filter(p => p.text.length > 0);

    await storeEmbeddings(documentId, newVersionId, pageTexts);
  } catch (err) {
    console.error('Embedding generation failed:', err.message);
  }
})();
```

Install `pdf-parse` on the server:

```bash
cd server && npm install pdf-parse
```

---

## Step 7 — Frontend code walkthrough

### useChat.js — chat state and streaming

```js
import { useState, useCallback } from 'react';

export default function useChat({ token }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);

  const sendMessage = useCallback(async (question) => {
    if (!question.trim() || loading) return;

    const userMessage = { role: 'user', content: question };
    setMessages(prev => [...prev, userMessage]);
    setLoading(true);

    // Add a placeholder assistant message that we'll fill token by token
    const assistantMessage = { role: 'assistant', content: '', pageRefs: [], streaming: true };
    setMessages(prev => [...prev, assistantMessage]);

    try {
      const conversationHistory = messages.slice(-10);
      const response = await fetch(`/api/qa/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, conversationHistory }),
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop(); // keep incomplete last chunk

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6));

            if (data.type === 'page_refs') {
              setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1].pageRefs = data.pageRefs;
                return updated;
              });
            }

            if (data.type === 'token') {
              setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1].content += data.text;
                return updated;
              });
            }

            if (data.type === 'done') {
              setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1].streaming = false;
                return updated;
              });
            }

            if (data.type === 'error') {
              setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1].content = 'Sorry, something went wrong. Please try again.';
                updated[updated.length - 1].streaming = false;
                return updated;
              });
            }
          } catch {
            // Malformed SSE line — skip
          }
        }
      }
    } catch {
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1].content = 'Connection error. Please try again.';
        updated[updated.length - 1].streaming = false;
        return updated;
      });
    } finally {
      setLoading(false);
    }
  }, [messages, token, loading]);

  function clearChat() {
    setMessages([]);
  }

  return { messages, loading, sendMessage, clearChat };
}
```

---

### AiSummaryCard.jsx — shown at top of diff panel

```jsx
export default function AiSummaryCard({ summary, loading }) {
  if (loading) {
    return (
      <div style={styles.card}>
        <div style={styles.header}>
          <span style={styles.aiLabel}>✦ AI Summary</span>
        </div>
        <div style={styles.skeleton} />
        <div style={{ ...styles.skeleton, width: '80%' }} />
      </div>
    );
  }

  if (!summary) return null;

  return (
    <div style={styles.card}>
      <div style={styles.header}>
        <span style={styles.aiLabel}>✦ AI Summary</span>
        <span style={styles.disclaimer}>AI-generated — verify important details</span>
      </div>
      <p style={styles.text}>{summary}</p>
    </div>
  );
}

const styles = {
  card: { background: '#fafaf8', border: '0.5px solid #e8e8e0', borderRadius: 8, padding: '12px 14px', margin: '8px 10px' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  aiLabel: { fontSize: 12, fontWeight: 600, color: '#7c6f64' },
  disclaimer: { fontSize: 10, color: '#bbb' },
  text: { fontSize: 13, color: '#333', lineHeight: 1.6, margin: 0 },
  skeleton: { height: 12, background: '#ebebeb', borderRadius: 4, marginBottom: 6, width: '100%', animation: 'pulse 1.5s infinite' },
};
```

---

### ChatMessage.jsx — message bubble with page refs

```jsx
import StreamingText from './StreamingText';

export default function ChatMessage({ message, onPageClick }) {
  const isUser = message.role === 'user';

  return (
    <div style={{ ...styles.wrap, justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
      <div style={{ ...styles.bubble, ...(isUser ? styles.userBubble : styles.aiBubble) }}>
        {isUser
          ? <p style={styles.text}>{message.content}</p>
          : <StreamingText text={message.content} streaming={message.streaming} />
        }

        {!isUser && message.pageRefs && message.pageRefs.length > 0 && (
          <div style={styles.refs}>
            <span style={styles.refLabel}>Sources:</span>
            {message.pageRefs.map(page => (
              <button
                key={page}
                style={styles.refBtn}
                onClick={() => onPageClick(page)}
              >
                p.{page}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  wrap: { display: 'flex', padding: '4px 10px' },
  bubble: { maxWidth: '85%', borderRadius: 10, padding: '8px 12px' },
  userBubble: { background: '#1a1a1a', color: '#fff' },
  aiBubble: { background: '#f5f5f3', color: '#1a1a1a', border: '0.5px solid #e8e8e0' },
  text: { fontSize: 13, lineHeight: 1.6, margin: 0 },
  refs: { display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', marginTop: 8, paddingTop: 6, borderTop: '0.5px solid #e0e0e0' },
  refLabel: { fontSize: 11, color: '#aaa' },
  refBtn: { fontSize: 11, padding: '2px 7px', background: '#fff', border: '0.5px solid #d0d0d0', borderRadius: 4, cursor: 'pointer', color: '#555' },
};
```

---

### StreamingText.jsx — renders text token by token

```jsx
export default function StreamingText({ text, streaming }) {
  return (
    <p style={{ fontSize: 13, lineHeight: 1.6, margin: 0 }}>
      {text}
      {streaming && (
        <span style={{
          display: 'inline-block', width: 2, height: 14,
          background: '#555', marginLeft: 1,
          animation: 'blink 1s step-end infinite',
          verticalAlign: 'text-bottom',
        }} />
      )}
      <style>{`
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
      `}</style>
    </p>
  );
}
```

---

### ChatPanel.jsx — full chat interface

```jsx
import { useState, useRef, useEffect } from 'react';
import ChatMessage from './ChatMessage';
import useChat from '../hooks/useChat';

export default function ChatPanel({ token, visible, onPageClick }) {
  const { messages, loading, sendMessage, clearChat } = useChat({ token });
  const [input, setInput] = useState('');
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function handleSend() {
    if (!input.trim() || loading) return;
    sendMessage(input.trim());
    setInput('');
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  if (!visible) return null;

  return (
    <div style={styles.panel}>
      <div style={styles.header}>
        <span style={styles.title}>Ask about this document</span>
        {messages.length > 0 && (
          <button style={styles.clearBtn} onClick={clearChat}>Clear</button>
        )}
      </div>

      <div style={styles.messages}>
        {messages.length === 0 && (
          <div style={styles.empty}>
            <p style={styles.emptyTitle}>Ask anything</p>
            <p style={styles.emptyHint}>Try: "What is the payment amount?" or "Summarize section 3"</p>
          </div>
        )}
        {messages.map((msg, i) => (
          <ChatMessage key={i} message={msg} onPageClick={onPageClick} />
        ))}
        <div ref={bottomRef} />
      </div>

      <div style={styles.inputArea}>
        <textarea
          style={styles.textarea}
          placeholder="Ask a question about this document…"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={2}
          disabled={loading}
        />
        <button
          style={{ ...styles.sendBtn, opacity: loading ? 0.5 : 1 }}
          onClick={handleSend}
          disabled={loading || !input.trim()}
        >
          {loading ? '…' : '↑'}
        </button>
      </div>
    </div>
  );
}

const styles = {
  panel: { width: 280, borderLeft: '0.5px solid #e0e0e0', background: '#fff', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  header: { padding: '12px 14px', borderBottom: '0.5px solid #e0e0e0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 13, fontWeight: 500, color: '#1a1a1a' },
  clearBtn: { fontSize: 11, color: '#aaa', background: 'none', border: 'none', cursor: 'pointer' },
  messages: { flex: 1, overflow: 'auto', padding: '8px 0' },
  empty: { padding: '2rem 1rem', textAlign: 'center' },
  emptyTitle: { fontSize: 14, fontWeight: 500, color: '#555', marginBottom: 6 },
  emptyHint: { fontSize: 12, color: '#aaa', lineHeight: 1.5 },
  inputArea: { borderTop: '0.5px solid #e0e0e0', padding: '10px', display: 'flex', gap: 8, alignItems: 'flex-end' },
  textarea: { flex: 1, resize: 'none', border: '0.5px solid #d0d0d0', borderRadius: 8, padding: '8px 10px', fontSize: 13, outline: 'none', fontFamily: 'inherit', lineHeight: 1.5 },
  sendBtn: { width: 34, height: 34, borderRadius: 8, background: '#1a1a1a', color: '#fff', border: 'none', fontSize: 16, cursor: 'pointer', flexShrink: 0 },
};
```

---

### Updated DiffPanel.jsx — add tabs for Diff and Chat

```jsx
// Replace the single-purpose DiffPanel with a tabbed version
import AiSummaryCard from './AiSummaryCard';
import ChangeBadge from './ChangeBadge';
import ChatPanel from './ChatPanel';

export default function SidePanel({
  changeMap, diffStats, summary, summaryLoading,
  visible, onChangeClick,
  token, onPageClick,
}) {
  const [activeTab, setActiveTab] = useState('diff');

  if (!visible) return null;

  return (
    <div style={styles.panel}>
      <div style={styles.tabs}>
        <button
          style={{ ...styles.tab, ...(activeTab === 'diff' ? styles.activeTab : {}) }}
          onClick={() => setActiveTab('diff')}
        >
          Changes {diffStats ? `(${diffStats.total})` : ''}
        </button>
        <button
          style={{ ...styles.tab, ...(activeTab === 'chat' ? styles.activeTab : {}) }}
          onClick={() => setActiveTab('chat')}
        >
          Ask AI
        </button>
      </div>

      {activeTab === 'diff' && (
        <>
          <AiSummaryCard summary={summary} loading={summaryLoading} />
          <ul style={styles.list}>
            {changeMap.length === 0 && (
              <p style={styles.empty}>No changes or diff not yet computed.</p>
            )}
            {changeMap.map((change, i) => (
              <li key={i} style={styles.item} onClick={() => onChangeClick(change)}>
                <div style={styles.itemHeader}>
                  <ChangeBadge type={change.type} />
                  <ChangeBadge importance={change.importance} />
                  <span style={styles.page}>p.{change.page + 1}</span>
                </div>
                {change.importance_reason && (
                  <p style={styles.reason}>{change.importance_reason}</p>
                )}
                <p style={styles.excerpt}>
                  {(change.new_text || change.old_text || '').slice(0, 80)}
                  {(change.new_text || change.old_text || '').length > 80 ? '…' : ''}
                </p>
              </li>
            ))}
          </ul>
        </>
      )}

      {activeTab === 'chat' && (
        <ChatPanel
          token={token}
          visible={true}
          onPageClick={onPageClick}
        />
      )}
    </div>
  );
}

const styles = {
  panel: { width: 300, borderLeft: '0.5px solid #e0e0e0', background: '#fff', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  tabs: { display: 'flex', borderBottom: '0.5px solid #e0e0e0' },
  tab: { flex: 1, padding: '10px', fontSize: 13, background: 'none', border: 'none', cursor: 'pointer', color: '#888' },
  activeTab: { color: '#1a1a1a', fontWeight: 500, borderBottom: '2px solid #1a1a1a' },
  list: { listStyle: 'none', overflow: 'auto', flex: 1, padding: '6px 0' },
  item: { padding: '10px 14px', cursor: 'pointer', borderBottom: '0.5px solid #f0f0f0' },
  itemHeader: { display: 'flex', gap: 5, alignItems: 'center', marginBottom: 4 },
  page: { fontSize: 11, color: '#aaa', marginLeft: 'auto' },
  reason: { fontSize: 11, color: '#888', margin: '3px 0', fontStyle: 'italic', lineHeight: 1.4 },
  excerpt: { fontSize: 12, color: '#555', lineHeight: 1.4, margin: 0 },
  empty: { padding: '2rem 1rem', fontSize: 13, color: '#aaa', textAlign: 'center' },
};
```

---

## API changes in Phase 7

### New endpoint: POST /api/qa/:token

```
Body: { question: string, conversationHistory: [{role, content}] }
Response: Server-Sent Events stream
Auth: None (public — uses share link token)
```

SSE event types:
```
data: {"type":"page_refs","pageRefs":[1,3,7]}
data: {"type":"token","text":"The payment"}
data: {"type":"token","text":" amount is"}
data: {"type":"done"}
data: {"type":"error","message":"AI service error"}
```

---

## Complete file structure after Phase 7

```
livepdf/
├── python/                          (unchanged from Phase 6)
│
├── server/
│   ├── src/
│   │   ├── index.js                 ← UPDATED (register /api/qa route)
│   │   ├── socket.js
│   │   ├── config/db.js
│   │   ├── services/
│   │   │   ├── diffService.js       ← UPDATED (trigger AI after diff)
│   │   │   ├── aiService.js         ← NEW
│   │   │   ├── embeddingService.js  ← NEW
│   │   │   └── qaService.js         ← NEW
│   │   ├── controllers/
│   │   │   ├── authController.js
│   │   │   ├── documentController.js ← UPDATED (trigger embeddings after upload)
│   │   │   └── shareController.js
│   │   └── routes/
│   │       ├── auth.js
│   │       ├── documents.js
│   │       ├── share.js
│   │       └── qa.js               ← NEW
│   └── migrations/
│       ├── schema.sql
│       ├── phase3.sql
│       ├── phase6.sql
│       └── phase7.sql              ← NEW
│
└── client/
    └── src/
        ├── hooks/
        │   ├── usePdfSearch.js
        │   ├── useSocket.js
        │   ├── useSignedUrlRefresh.js
        │   ├── useDiff.js
        │   └── useChat.js          ← NEW
        ├── components/
        │   ├── PdfViewer.jsx
        │   ├── PdfToolbar.jsx
        │   ├── SearchBar.jsx
        │   ├── PreviewModal.jsx
        │   ├── ConnectionStatus.jsx
        │   ├── ViewerToast.jsx
        │   ├── DiffOverlay.jsx
        │   ├── DiffTooltip.jsx
        │   ├── DiffPanel.jsx       ← UPDATED (renamed SidePanel, tabbed)
        │   ├── ChangeBadge.jsx
        │   ├── AiSummaryCard.jsx   ← NEW
        │   ├── ChatPanel.jsx       ← NEW
        │   ├── ChatMessage.jsx     ← NEW
        │   └── StreamingText.jsx   ← NEW
        └── pages/
            └── Viewer.jsx          ← UPDATED (pass token + summary to SidePanel)
```

---

## How to test Phase 7

### Test AI change summary

1. Upload a document and upload a new version with a few changes
2. Wait 3–5 seconds for the diff and AI summary to compute
3. Open the share link — diff panel should show an AI Summary card at the top
4. The card should describe the changes in plain English with page references

### Test AI risk classification

1. Upload a new version where you change a number (e.g. a price)
2. That change should show "High" badge with a reason like:
   "Contains a numerical value change that may affect financial terms"
3. Upload a version with the word "termination" changed
4. That change should show "⚠ Critical" badge

### Test Q&A

1. Open any share link
2. Click the "Ask AI" tab in the right panel
3. Type: "What is this document about?"
4. Answer should stream in word by word
5. Page reference buttons should appear below the answer
6. Click a page button — the viewer should jump to that page
7. Ask a follow-up: "Can you give more detail about that?"
8. Claude should answer in context of the previous exchange

### Test Q&A cache

1. Ask the same question twice
2. Second response should arrive instantly (no streaming delay)
3. Check server logs — you should see "Cache hit" logged

### Test streaming

1. Open browser DevTools → Network tab
2. Ask a question
3. Find the `/api/qa/:token` request
4. Click it → EventStream tab
5. Watch SSE events arrive one by one in real time

---

## Common errors and fixes

| Error | Cause | Fix |
|---|---|---|
| `Error: pgvector extension not found` | pgvector not installed | Install pgvector for your PostgreSQL version and run `CREATE EXTENSION vector` |
| `dimension mismatch` in pgvector | Embedding dimension changed | Drop and recreate the embeddings table with the correct `vector(N)` dimension |
| `401 Unauthorized` from Anthropic | Wrong API key | Check `ANTHROPIC_API_KEY` in `.env` — no extra spaces |
| `401 Unauthorized` from OpenAI | Wrong API key | Check `OPENAI_API_KEY` in `.env` |
| Summary shows but changes still show `Low` | AI classification async not awaited | Check the async IIFE in `diffService.js` runs without throwing |
| Streaming stops mid-response | Client disconnects before stream ends | Check for `res.writableEnded` before writing — add try/catch around `res.write` |
| Q&A answers about wrong document | Wrong `versionId` used in similarity search | Log `current_version_id` from the share link lookup and confirm it matches |
| Embeddings not generated | `pdf-parse` failing on the PDF | Some PDFs have no extractable text (scanned images) — log the error and skip |

---

## Cost estimates

| Feature | API | Cost per call |
|---|---|---|
| Change summary | Claude Sonnet | ~$0.003 per diff |
| Risk classification (20 changes) | Claude Sonnet | ~$0.005 per diff |
| Embedding generation (100 chunks) | text-embedding-3-small | ~$0.000002 per chunk |
| Q&A answer | Claude Sonnet | ~$0.004 per question |

With caching, real-world costs are significantly lower since the same diff
summary and Q&A answers are served from the database for all subsequent requests.

---

## What's next — Phase 8

Phase 8 adds notifications and audit features:

- Email alerts to document followers when a new version is uploaded
  (includes the AI summary in the email body)
- In-app notification bell with unread count
- Full audit log viewer showing who viewed, when, and from which IP
- Client-side watermarking overlaid on the PDF canvas
- Bull/BullMQ job queue for async email delivery so uploads are never slowed
  down by email sending
