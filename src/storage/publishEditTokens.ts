const STORAGE_KEY = 'sawgraph.publishEditTokens.v1';

type TokenMap = Record<string, string>;

function readAll(): TokenMap {
  if (typeof window === 'undefined' || !window.localStorage) return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed as TokenMap;
  } catch {
    /* ignore */
  }
  return {};
}

function writeAll(map: TokenMap): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

export const publishEditTokens = {
  get(publishId: string): string | null {
    return readAll()[publishId] ?? null;
  },
  set(publishId: string, token: string): void {
    const map = readAll();
    map[publishId] = token;
    writeAll(map);
  },
  remove(publishId: string): void {
    const map = readAll();
    delete map[publishId];
    writeAll(map);
  },
};
