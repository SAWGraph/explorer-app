// An option label with its count, when there is one to show.
export function withCount(label: string, count?: number): string {
  return count && count > 0 ? `${label} (${count.toLocaleString()})` : label;
}
