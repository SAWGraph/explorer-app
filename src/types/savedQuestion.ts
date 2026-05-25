import type { AnalysisQuestion } from './query';

export interface SavedQuestion {
  id: string;
  name: string;
  question: AnalysisQuestion;
  basedOnQueryId: string | null;
  createdAt: number;
  updatedAt: number;
}

export const SAVED_QUESTION_ID_PREFIX = 'saved:';

export function isSavedQuestionId(id: string | null | undefined): boolean {
  return !!id && id.startsWith(SAVED_QUESTION_ID_PREFIX);
}

export function toSavedQueryParam(id: string): string {
  return `${SAVED_QUESTION_ID_PREFIX}${id}`;
}

export function parseSavedQueryParam(routeId: string): string | null {
  if (!routeId.startsWith(SAVED_QUESTION_ID_PREFIX)) return null;
  return routeId.slice(SAVED_QUESTION_ID_PREFIX.length);
}
