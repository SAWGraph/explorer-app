import type { AnalysisQuestion } from '../types/query';
import type { SavedQuestion } from '../types/savedQuestion';
import { deepClone } from '../utils/clone';

const STORAGE_KEY = 'sawgraph.savedQuestions.v1';
const MAX_ENTRIES = 50;

export interface CreateSavedQuestionInput {
  name: string;
  question: AnalysisQuestion;
  basedOnQueryId: string | null;
}

export interface UpdateSavedQuestionPatch {
  name?: string;
  question?: AnalysisQuestion;
}

export interface SavedQuestionsRepo {
  list(): SavedQuestion[];
  get(id: string): SavedQuestion | null;
  create(input: CreateSavedQuestionInput): SavedQuestion;
  update(id: string, patch: UpdateSavedQuestionPatch): SavedQuestion;
  remove(id: string): void;
}

function genId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback for older environments
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function isStorageAvailable(): boolean {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return false;
    const probe = '__sawgraph_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

function readAll(): SavedQuestion[] {
  if (!isStorageAvailable()) return memoryFallback.slice();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidSavedQuestion);
  } catch {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    return [];
  }
}

function writeAll(items: SavedQuestion[]): void {
  if (!isStorageAvailable()) {
    memoryFallback = items.slice();
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    memoryFallback = items.slice();
  }
}

function isValidSavedQuestion(value: unknown): value is SavedQuestion {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<SavedQuestion>;
  return (
    typeof v.id === 'string' &&
    typeof v.name === 'string' &&
    !!v.question &&
    typeof v.createdAt === 'number' &&
    typeof v.updatedAt === 'number'
  );
}

let memoryFallback: SavedQuestion[] = [];

function sortByUpdatedDesc(items: SavedQuestion[]): SavedQuestion[] {
  return items.slice().sort((a, b) => b.updatedAt - a.updatedAt);
}

export const savedQuestionsRepo: SavedQuestionsRepo = {
  list() {
    return sortByUpdatedDesc(readAll());
  },

  get(id) {
    const items = readAll();
    return items.find((q) => q.id === id) ?? null;
  },

  create({ name, question, basedOnQueryId }) {
    const now = Date.now();
    const entry: SavedQuestion = {
      id: genId(),
      name: name.trim(),
      question: deepClone(question),
      basedOnQueryId,
      createdAt: now,
      updatedAt: now,
    };
    let items = readAll();
    items.unshift(entry);
    if (items.length > MAX_ENTRIES) {
      items = sortByUpdatedDesc(items).slice(0, MAX_ENTRIES);
    }
    writeAll(items);
    return entry;
  },

  update(id, patch) {
    const items = readAll();
    const idx = items.findIndex((q) => q.id === id);
    if (idx === -1) {
      throw new Error(`SavedQuestion not found: ${id}`);
    }
    const existing = items[idx];
    const updated: SavedQuestion = {
      ...existing,
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      ...(patch.question !== undefined ? { question: deepClone(patch.question) } : {}),
      updatedAt: Date.now(),
    };
    items[idx] = updated;
    writeAll(items);
    return updated;
  },

  remove(id) {
    const items = readAll().filter((q) => q.id !== id);
    writeAll(items);
  },
};
