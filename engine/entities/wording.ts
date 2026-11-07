// Phrasing helpers for the entity modules' describe(). The question sentence
// (engine/questionGenerator.ts) takes QuestionTotals and LIST_THRESHOLD from here
// so its region wording uses the same list threshold.
import type { FtypeOption } from '../constants/featureTypes';

export interface QuestionTotals {
  counties?: Record<string, number>; // state FIPS → county count
  industries?: number;
  substances?: number;
  materialTypes?: number;
}

export const LIST_THRESHOLD = 3;

// Returns either the joined list, a count summary ("N counties"), or an "all/any" phrase.
export function summarize(
  items: string[],
  total: number | undefined,
  pluralNoun: string,
  singularNoun: string,
  listJoin: string,
  allWord: 'all' | 'any',
): string {
  if (total !== undefined && total > 0 && items.length === total) {
    return `${allWord} ${allWord === 'any' ? singularNoun : pluralNoun}`;
  }
  if (items.length > LIST_THRESHOLD) {
    return `${items.length} ${pluralNoun}`;
  }
  return items.join(listJoin);
}

// A block's filtered noun: its picks named in front ("Stream / River
// streams"), or, past LIST_THRESHOLD, the count after the noun ("streams of 4
// types"). The count used to go in front too, which said the noun twice: "4
// stream types streams", "4 industries facilities".
export function namedOrCounted(items: string[], label: string, join: string, counted: (n: number) => string): string {
  if (items.length === 0) return label;
  if (items.length > LIST_THRESHOLD) return `${label} ${counted(items.length)}`;
  return `${items.join(join)} ${label}`;
}

export const ftypeLabels = (values: string[], options: FtypeOption[]): string[] =>
  values.map((v) => options.find((o) => o.value === v)?.label ?? v);

export function extractLabel(uri: string): string {
  // Extract the last part of a URI or prefixed name
  const lastDot = uri.lastIndexOf('.');
  const lastHash = uri.lastIndexOf('#');
  const lastSlash = uri.lastIndexOf('/');
  const pos = Math.max(lastDot, lastHash, lastSlash);
  return pos >= 0 ? uri.slice(pos + 1) : uri;
}
