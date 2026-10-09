import { gzipSync } from 'node:zlib';
import { pool } from './db.js';

// Payload budget for a single cached result. Measured pipelines run 3-7MB of
// JSON once the internal IRI lists are trimmed client-side; the largest observed
// (a statewide downstream trace with 15MB of river geometry) reached 21MB, and
// the Indiana water-bodies-near-airports demo question 26.6MB of polygons.
// Anything past this is skipped rather than stored — publishing still succeeds.
// Stored gzipped, so the row itself is a fraction of this.
export const MAX_RESULT_BYTES = 32 * 1024 * 1024;

// A clean result is stable until the graph reloads. A partial one is not: it
// means slices failed, and a warmer engine may answer them, so it must not be
// frozen for a month.
const TTL_DAYS_COMPLETE = 30;
const TTL_HOURS_PARTIAL = 6;

export interface StoredResult {
  payload: Buffer;
  computedAt: Date;
  partial: boolean;
}

export async function putResult(params: {
  cacheKey: string;
  question: unknown;
  body: string;
  partial: boolean;
  source: 'publish' | 'prewarm';
}): Promise<{ bytes: number }> {
  const payload = gzipSync(Buffer.from(params.body, 'utf8'));
  const ttl = params.partial
    ? `${TTL_HOURS_PARTIAL} hours`
    : `${TTL_DAYS_COMPLETE} days`;

  await pool.query(
    `INSERT INTO query_results
       (cache_key, question, payload, payload_bytes, source, partial, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, now() + $7::interval)
     ON CONFLICT (cache_key) DO UPDATE SET
       question = EXCLUDED.question,
       payload = EXCLUDED.payload,
       payload_bytes = EXCLUDED.payload_bytes,
       source = EXCLUDED.source,
       partial = EXCLUDED.partial,
       created_at = now(),
       expires_at = EXCLUDED.expires_at`,
    [
      params.cacheKey,
      params.question,
      payload,
      payload.length,
      params.source,
      params.partial,
      ttl,
    ],
  );

  return { bytes: payload.length };
}

export async function getResult(cacheKey: string): Promise<StoredResult | null> {
  // Expired rows are treated as a miss immediately, without waiting for the
  // sweeper to reach them.
  const result = await pool.query(
    `UPDATE query_results
        SET hit_count = hit_count + 1, last_hit_at = now()
      WHERE cache_key = $1 AND expires_at > now()
      RETURNING payload, created_at, partial`,
    [cacheKey],
  );
  if (result.rowCount === 0) return null;
  const row = result.rows[0];
  return { payload: row.payload, computedAt: row.created_at, partial: row.partial };
}

export async function sweepExpired(): Promise<number> {
  const result = await pool.query(`DELETE FROM query_results WHERE expires_at < now()`);
  return result.rowCount ?? 0;
}

// The stored bytes are served exactly as they are stored — never decompressed
// here and re-compressed by the framework. The browser inflates transparently.
export function sendGzipJson(
  res: {
    setHeader: (k: string, v: string) => void;
    end: (chunk: Buffer) => void;
  },
  stored: StoredResult,
): void {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Encoding', 'gzip');
  res.setHeader('Content-Length', String(stored.payload.length));
  res.setHeader('X-Result-Computed-At', stored.computedAt.toISOString());
  res.setHeader('X-Result-Partial', stored.partial ? '1' : '0');
  res.end(stored.payload);
}
