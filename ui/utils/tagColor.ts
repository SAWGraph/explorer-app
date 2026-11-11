const TAG_COLORS: Record<string, string> = {
  Samples: 'var(--color-tag-samples)',
  Facilities: 'var(--color-tag-facilities)',
  'Water Bodies': 'var(--color-tag-water-bodies)',
  Near: 'var(--color-tag-near)',
  Downstream: 'var(--color-tag-downstream)',
  Upstream: 'var(--color-tag-upstream)',
};

export function getTagColor(tag: string): string {
  for (const [key, color] of Object.entries(TAG_COLORS)) {
    if (tag.includes(key)) return color;
  }
  return 'var(--color-gray-500)';
}
