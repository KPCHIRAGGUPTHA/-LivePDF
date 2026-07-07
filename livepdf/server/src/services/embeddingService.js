const { HfInference } = require('@huggingface/inference');
const pool = require('../config/db');

const apiKey = process.env.HF_API_KEY;
let hf;
if (apiKey && !apiKey.startsWith('your_')) {
  hf = new HfInference(apiKey);
} else {
  console.log('⚠️ HF_API_KEY is not set or set to placeholder. Embedding features will run in Mock Mode.');
}

const CHUNK_SIZE  = parseInt(process.env.CHUNK_SIZE_TOKENS)  || 500;
const OVERLAP     = parseInt(process.env.CHUNK_OVERLAP_TOKENS) || 50;
const MODEL       = process.env.HF_EMBEDDING_MODEL || 'sentence-transformers/all-MiniLM-L6-v2';
const DIMENSIONS  = parseInt(process.env.EMBEDDING_DIMENSIONS) || 384;

// Helper to check if the database has pgvector activated for this column
async function detectPgVector() {
  try {
    const res = await pool.query(
      `SELECT udt_name 
       FROM information_schema.columns 
       WHERE table_name = 'embeddings' AND column_name = 'embedding'`
    );
    if (res.rows.length > 0) {
      return res.rows[0].udt_name === 'vector';
    }
  } catch (err) {
    console.error('Failed to detect pgvector via information_schema:', err.message);
  }
  return false;
}

// ─── Cosine Similarity in JS (Fallback) ────────────────────────
function jsCosineSimilarity(vecA, vecB) {
  let dotProduct = 0.0;
  let normA = 0.0;
  let normB = 0.0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ─── Text chunking ────────────────────────────────────────────

function chunkText(pages) {
  /**
   * pages: [{ pageNumber: 0, text: '...' }, ...]
   * Returns: [{ chunkIndex, chunkText, pageNumber }]
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
  if (!hf) {
    // Mock Mode fallback: Array of random floats
    return chunks.map(chunk => {
      const embedding = Array.from({ length: DIMENSIONS }, () => Math.random() * 2 - 1);
      return {
        ...chunk,
        embedding,
      };
    });
  }

  const texts = chunks.map(c => c.chunkText);
  const response = await hf.featureExtraction({
    model: MODEL,
    inputs: texts,
  });

  return chunks.map((chunk, i) => ({
    ...chunk,
    embedding: response[i],
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

  const hasPgVector = await detectPgVector();

  // Batch insert
  const values = [];
  const params = [];
  let paramIndex = 1;

  for (const chunk of chunksWithEmbeddings) {
    values.push(
      `($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, ` +
      `$${paramIndex++}, $${paramIndex++}, $${paramIndex++})`
    );
    
    // In pgvector, we pass the array formatted as '[1,2,3...]'
    // In standard arrays, we pass it as a JS array [1,2,3...]
    const dbEmbedding = hasPgVector 
      ? `[${chunk.embedding.join(',')}]` 
      : chunk.embedding;

    params.push(
      documentId,
      versionId,
      chunk.chunkIndex,
      chunk.chunkText,
      chunk.pageNumber,
      dbEmbedding
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

  console.log(`Stored ${chunksWithEmbeddings.length} embeddings for version ${versionId} (pgvector = ${hasPgVector})`);
}

// ─── Similarity search ────────────────────────────────────────

async function findSimilarChunks(questionText, versionId, topK = 5) {
  const hasPgVector = await detectPgVector();

  // If running in Mock mode, fall back to smart keyword search
  if (!hf) {
    const res = await pool.query(
      `SELECT chunk_index, chunk_text, page_number, embedding 
       FROM embeddings 
       WHERE version_id = $1`,
      [versionId]
    );

    if (res.rows.length === 0) return [];

    const qWords = questionText.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    const rated = res.rows.map(row => {
      const text = row.chunk_text.toLowerCase();
      let score = 0;
      for (const word of qWords) {
        if (text.includes(word)) {
          score += 1.0;
        }
      }
      const similarity = score > 0 
        ? 0.5 + (score / (qWords.length + 1)) * 0.5 
        : Math.random() * 0.1;

      return {
        chunk_index: row.chunk_index,
        chunk_text: row.chunk_text,
        page_number: row.page_number,
        similarity,
      };
    });

    rated.sort((a, b) => b.similarity - a.similarity);
    return rated.slice(0, topK);
  }

  // Get question embedding
  const questionEmbedding = await hf.featureExtraction({
    model: MODEL,
    inputs: questionText,
  });

  if (hasPgVector) {
    // Cosine similarity search using pgvector <=> operator
    const vectorStr = `[${questionEmbedding.join(',')}]`;
    const result = await pool.query(
      `SELECT chunk_index, chunk_text, page_number,
              1 - (embedding <=> $1::vector) AS similarity
       FROM embeddings
       WHERE version_id = $2
       ORDER BY embedding <=> $1::vector
       LIMIT $3`,
      [vectorStr, versionId, topK]
    );
    return result.rows;
  } else {
    // Fallback: Cosine similarity in JS
    const result = await pool.query(
      `SELECT chunk_index, chunk_text, page_number, embedding
       FROM embeddings
       WHERE version_id = $1`,
      [versionId]
    );

    if (result.rows.length === 0) return [];

    const rated = result.rows.map(row => {
      // In pg, a REAL[] is returned as a JS array of floats
      const dbVector = row.embedding;
      const similarity = jsCosineSimilarity(questionEmbedding, dbVector);
      return {
        chunk_index: row.chunk_index,
        chunk_text: row.chunk_text,
        page_number: row.page_number,
        similarity,
      };
    });

    rated.sort((a, b) => b.similarity - a.similarity);
    return rated.slice(0, topK);
  }
}

module.exports = { storeEmbeddings, findSimilarChunks, chunkText };
