import { createHash, timingSafeEqual } from 'node:crypto';
import express, { Router, type Request, type Response } from 'express';
import { getResult, putResult, sendGzipJson, MAX_RESULT_BYTES } from '../resultCache.js';

export const resultsRouter = Router();

// Route-scoped body limit. The app-wide limit stays at 64kb (index.ts) — only
// these two routes accept a multi-megabyte result.
const largeJson = express.json({ limit: `${Math.ceil(MAX_RESULT_BYTES / (1024 * 1024))}mb` });

function writeTokenValid(provided: string | undefined): boolean {
  const expected = process.env.CACHE_WRITE_TOKEN;
  // No token configured means no one can write. Failing closed matters here:
  // these entries are rendered on other people's maps.
  if (!expected || !provided) return false;
  const a = createHash('sha256').update(provided).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

// Public read.
resultsRouter.get('/:key', async (req: Request, res: Response) => {
  try {
    const stored = await getResult(String(req.params.key));
    if (!stored) return res.status(404).json({ error: 'not cached' });
    return sendGzipJson(res, stored);
  } catch (err) {
    console.error('result fetch failed', err);
    return res.status(500).json({ error: 'failed to fetch result' });
  }
});

// Write, for the warm-cache script only (scripts/warm-cache.mts). The publisher
// path is PUT /api/publish/:id/result, guarded by the editToken instead.
resultsRouter.put('/:key', largeJson, async (req: Request, res: Response) => {
  const key = String(req.params.key);

  if (!writeTokenValid(req.header('x-cache-token'))) {
    return res.status(401).json({ error: 'invalid cache write token' });
  }

  const body = req.body as { question?: unknown; result?: unknown };
  if (!body?.question || !body?.result) {
    return res.status(400).json({ error: 'question and result are required' });
  }
  if (!key.startsWith('q:')) {
    return res.status(400).json({ error: 'key must be in the q: namespace' });
  }

  const serialized = JSON.stringify(body.result);
  if (Buffer.byteLength(serialized, 'utf8') > MAX_RESULT_BYTES) {
    return res.status(413).json({ error: 'result too large to cache' });
  }

  try {
    const { bytes } = await putResult({
      cacheKey: key,
      question: body.question,
      body: serialized,
      partial: Boolean((body.result as { partial?: unknown }).partial),
      source: 'prewarm',
    });
    return res.status(201).json({ key, bytes });
  } catch (err) {
    console.error('result write failed', err);
    return res.status(500).json({ error: 'failed to store result' });
  }
});
