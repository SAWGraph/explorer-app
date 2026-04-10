import { useState } from 'react';
import type { PrebuiltQuery } from '../../constants/prebuiltQueries';

interface PrebuiltQueryCardProps {
  query: PrebuiltQuery;
  onClick: () => void;
}

const TAG_COLORS: Record<string, string> = {
  Samples: 'var(--color-tag-samples)',
  Facilities: 'var(--color-tag-facilities)',
  'Water Bodies': 'var(--color-tag-water-bodies)',
  Near: 'var(--color-tag-near)',
  Downstream: 'var(--color-tag-downstream)',
  Upstream: 'var(--color-tag-upstream)',
};

function getTagColor(tag: string): string {
  for (const [key, color] of Object.entries(TAG_COLORS)) {
    if (tag.includes(key)) return color;
  }
  return 'var(--color-gray-500)';
}

const MAX_VISIBLE_TAGS = 3;

export function PrebuiltQueryCard({ query, onClick }: PrebuiltQueryCardProps) {
  const [expanded, setExpanded] = useState(false);

  const visibleTags = query.tags.slice(0, MAX_VISIBLE_TAGS);
  const hiddenCount = query.tags.length - MAX_VISIBLE_TAGS;

  return (
    <div className='query-card' onClick={onClick}>
      <h3 className='query-card-title'>{query.title}</h3>

      <button
        className='query-card-toggle'
        onClick={(e) => {
          e.stopPropagation();
          setExpanded(!expanded);
        }}
      >
        See More Details {expanded ? '\u25B4' : '\u25BE'}
      </button>

      {expanded && <p className='query-card-desc'>{query.description}</p>}

      <div className='query-card-tags'>
        <span className='query-card-tags-label'>Tags</span>
        {visibleTags.map((tag) => (
          <span
            key={tag}
            className='query-tag'
            style={{ '--tag-color': getTagColor(tag) } as React.CSSProperties}
          >
            {tag}
          </span>
        ))}
        {hiddenCount > 0 && (
          <span className='query-tag query-tag-more'>+{hiddenCount}</span>
        )}
      </div>
    </div>
  );
}
