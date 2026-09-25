import type { PipelineSuccess } from '../engine/executor';
import { cacheKey } from '../engine/cacheKey';
import { fromWire, isWireResult, toWire, type WireResult } from '../engine/wire';
import type { AnalysisQuestion } from '../types/query';

function getApiBase(): string {
  const base = import.meta.env.VITE_API_BASE_URL;
  if (!base) throw new Error('VITE_API_BASE_URL is not set. Add it to .env.local (see .env.example).');
  return base.replace(/\/$/, '');
}

export interface CachedResult {
  result: PipelineSuccess;
  computedAt: string | null;
  partial: boolean;
}

// `?cache=off` forces a live run — for debugging, and for anyone who needs to
// be certain they are looking at fresh data.
export function cacheDisabled(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('cache') === 'off';
}

async function readCache(url: string): Promise<CachedResult | null> {
  const res = await fetch(url);
  if (!res.ok) return null; // 404 is the normal miss; anything else is also just a miss
  const body: unknown = await res.json();
  if (!isWireResult(body)) return null;
  return {
    result: fromWire(body),
    computedAt: res.headers.get('X-Result-Computed-At') ?? body.computedAt ?? null,
    partial: res.headers.get('X-Result-Partial') === '1',
  };
}

// A cache miss must never break a run — any failure here falls through to
// executing the pipeline locally, exactly as before this cache existed.
export async function fetchCachedResult(question: AnalysisQuestion): Promise<CachedResult | null> {
  if (cacheDisabled()) return null;
  try {
    return await readCache(`${getApiBase()}/api/results/${await cacheKey(question)}`);
  } catch {
    return null;
  }
}

export async function fetchPublishedResult(publishId: string): Promise<CachedResult | null> {
  if (cacheDisabled()) return null;
  try {
    return await readCache(`${getApiBase()}/api/publish/${publishId}/result`);
  } catch {
    return null;
  }
}

// Called after a successful publish with the result the publisher already has.
// Never throws: caching is a bonus, and a publish that succeeded must not look
// like a failure because the upload of a 7MB payload did not.
export async function savePublishedResult(
  publishId: string,
  editToken: string,
  result: PipelineSuccess,
): Promise<boolean> {
  try {
    const wire: WireResult = toWire(result);
    const res = await fetch(`${getApiBase()}/api/publish/${publishId}/result`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ editToken, result: wire }),
    });
    if (!res.ok) console.warn(`Could not cache published result (${res.status})`);
    return res.ok;
  } catch (err) {
    console.warn('Could not cache published result', err);
    return false;
  }
}
