const { GoogleGenAI } = require('@google/genai');
const pool = require('../config/db');
const crypto = require('crypto');
const { findSimilarChunks } = require('./embeddingService');

const apiKey = process.env.GEMINI_API_KEY;
let ai;
if (apiKey && !apiKey.startsWith('your_')) {
  ai = new GoogleGenAI({ apiKey });
} else {
  console.log('⚠️ GEMINI_API_KEY is not set or set to placeholder. Q&A Gemini features will run in Mock Mode.');
}

const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

function buildQaPrompt(question, chunks, documentTitle, conversationHistory, diffContext = '') {
  const context = chunks
    .map((c) => `[Page ${c.page_number + 1}]\n${c.chunk_text}`)
    .join('\n\n---\n\n');

  return `You are a helpful document assistant for "${documentTitle || 'this document'}".
Answer the user's question using the document excerpts and/or the version changes (diffs) context provided below.
If the answer is not found in either the excerpts or the version changes context, say: "I could not find information about this in the document."
Do not make up information. When referencing content, mention the page number.

${diffContext ? `DOCUMENT VERSION CHANGES / DIFF CONTEXT:\n${diffContext}\n\n` : ''}

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

async function getDiffContext(versionId) {
  try {
    const diffRes = await pool.query(
      `SELECT vd.change_map, ais.summary_text
       FROM version_diffs vd
       LEFT JOIN ai_summaries ais ON ais.version_diff_id = vd.id
       WHERE vd.new_version_id = $1`,
      [versionId]
    );

    if (diffRes.rows.length > 0) {
      const { change_map, summary_text } = diffRes.rows[0];
      const changesList = change_map
        .map((c, i) => {
          const oldText = c.old_text ? c.old_text.trim().replace(/\n/g, ' ') : 'N/A';
          const newText = c.new_text ? c.new_text.trim().replace(/\n/g, ' ') : 'N/A';
          return `- Page ${c.page + 1}: [${c.type}] [Importance: ${c.importance || 'Low'}] "${oldText}" → "${newText}" (${c.importance_reason || 'No reason'})`;
        })
        .join('\n');

      return `Version Changes Summary:\n${summary_text || 'No summary available.'}\n\nDetailed Version Changes list:\n${changesList}`;
    }
  } catch (err) {
    console.error('Failed to get diff context for Q&A:', err.message);
  }
  return '';
}

// Non-streaming Q&A
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
  try {
    const cached = await pool.query(
      'SELECT answer_text, page_refs FROM qa_cache WHERE version_id = $1 AND question_hash = $2',
      [versionId, questionHash]
    );
    if (cached.rows.length > 0) {
      console.log(`[QA Cache] HIT for: "${question}"`);
      return {
        answer: cached.rows[0].answer_text,
        pageRefs: cached.rows[0].page_refs,
        cached: true,
      };
    }
  } catch (dbErr) {
    console.error('QA cache lookup failed:', dbErr.message);
  }

  console.log(`[QA Cache] MISS for: "${question}"`);

  let answerText = '';
  const pageRefs = [...new Set(chunks.map(c => c.page_number + 1))].sort((a, b) => a - b);

  if (!ai) {
    // Mock Mode fallback
    answerText = `[Mock Q&A Assistant] I found matching contents on pages: ${pageRefs.join(', ')}.\n\n` +
      `Here is a summary of the relevant sections:\n` +
      chunks.slice(0, 2).map((c, i) => `${i + 1}. [Page ${c.page_number + 1}]: "${c.chunk_text.slice(0, 150)}..."`).join('\n\n');
  } else {
    try {
      const diffContext = await getDiffContext(versionId);
      const prompt = buildQaPrompt(question, chunks, documentTitle, conversationHistory, diffContext);

      const response = await ai.models.generateContent({
        model: MODEL,
        contents: prompt,
      });

      answerText = response.text.trim();
    } catch (err) {
      console.error('QA Gemini API call failed:', err.message);
      return {
        answer: 'Failed to generate answer. Please try again later.',
        pageRefs: [],
        cached: false,
      };
    }
  }

  // Cache the result
  try {
    await pool.query(
      `INSERT INTO qa_cache
        (document_id, version_id, question_hash, question_text, answer_text, page_refs)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (version_id, question_hash) DO NOTHING`,
      [documentId, versionId, questionHash, question, answerText, pageRefs]
    );
  } catch (dbErr) {
    console.error('Failed to cache QA answer:', dbErr.message);
  }

  return { answer: answerText, pageRefs, cached: false };
}

// Streaming Q&A — yields tokens one by one
async function* answerQuestionStream({ question, versionId, documentId, documentTitle,
                                       conversationHistory = [] }) {
  const chunks = await findSimilarChunks(question, versionId);
  const pageRefs = [...new Set(chunks.map(c => c.page_number + 1))].sort((a, b) => a - b);

  // Yield page refs first so the frontend can show them immediately
  yield { type: 'page_refs', pageRefs };

  if (chunks.length === 0) {
    yield { type: 'token', text: 'I could not find any relevant content in this document.' };
    yield { type: 'done' };
    return;
  }

  const questionHash = makeQuestionHash(question, chunks);

  // Check cache first
  try {
    const cached = await pool.query(
      'SELECT answer_text FROM qa_cache WHERE version_id = $1 AND question_hash = $2',
      [versionId, questionHash]
    );
    if (cached.rows.length > 0) {
      console.log(`[QA Cache] HIT for: "${question}" (streaming)`);
      const cachedText = cached.rows[0].answer_text;
      
      // Simulate typing/streaming for cached text to maintain UX, or just yield it in chunks
      // Let's yield it in blocks of ~10 characters every 10ms so it appears smoothly but fast
      const chunkSize = 15;
      for (let i = 0; i < cachedText.length; i += chunkSize) {
        yield { type: 'token', text: cachedText.slice(i, i + chunkSize) };
        await new Promise(resolve => setTimeout(resolve, 15));
      }
      yield { type: 'done' };
      return;
    }
  } catch (dbErr) {
    console.error('QA cache lookup failed (streaming):', dbErr.message);
  }

  console.log(`[QA Cache] MISS for: "${question}" (streaming)`);

  let fullAnswer = '';

  if (!ai) {
    // Mock Mode fallback streaming
    const mockAnswerText = `[Mock Q&A Assistant] I found matching contents on pages: ${pageRefs.join(', ')}.\n\n` +
      `Here is a summary of the relevant sections:\n` +
      chunks.slice(0, 2).map((c, i) => `${i + 1}. [Page ${c.page_number + 1}]: "${c.chunk_text.slice(0, 150)}..."`).join('\n\n');

    const chunkSize = 8;
    for (let i = 0; i < mockAnswerText.length; i += chunkSize) {
      const chunk = mockAnswerText.slice(i, i + chunkSize);
      fullAnswer += chunk;
      yield { type: 'token', text: chunk };
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  } else {
    try {
      const diffContext = await getDiffContext(versionId);
      const prompt = buildQaPrompt(question, chunks, documentTitle, conversationHistory, diffContext);

      const responseStream = await ai.models.generateContentStream({
        model: MODEL,
        contents: prompt,
      });

      for await (const chunk of responseStream) {
        const text = chunk.text;
        if (text) {
          fullAnswer += text;
          yield { type: 'token', text };
        }
      }
    } catch (err) {
      console.error('QA Gemini streaming failed:', err.message);
      yield { type: 'error', message: 'Failed to stream AI answer.' };
      return;
    }
  }

  // Cache the generated answer
  if (fullAnswer.trim().length > 0) {
    try {
      await pool.query(
        `INSERT INTO qa_cache
          (document_id, version_id, question_hash, question_text, answer_text, page_refs)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (version_id, question_hash) DO NOTHING`,
        [documentId, versionId, questionHash, question, fullAnswer.trim(), pageRefs]
      );
    } catch (dbErr) {
      console.error('Failed to cache QA answer (streaming):', dbErr.message);
    }
  }

  yield { type: 'done' };
}

module.exports = { answerQuestion, answerQuestionStream };
