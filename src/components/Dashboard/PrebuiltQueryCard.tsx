import { useState } from 'react';
import type { PrebuiltQuery } from '../../constants/prebuiltQueries';
import { getTagColor } from '../../utils/tagColor';
import { questionThumbnailUrl } from '../../constants/regionBounds';

interface PrebuiltQueryCardProps {
  query: PrebuiltQuery;
  onClick: () => void;
}

const MAX_VISIBLE_TAGS = 3;

export function PrebuiltQueryCard({ query, onClick }: PrebuiltQueryCardProps) {
  const [expanded, setExpanded] = useState(false);

  const visibleTags = query.tags.slice(0, MAX_VISIBLE_TAGS);
  const hiddenCount = query.tags.length - MAX_VISIBLE_TAGS;

  return (
    <div className='query-card query-card-with-thumb' onClick={onClick}>
      <div className='query-card-body'>
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

      <img
        className='query-card-thumb'
        src={`/thumbs/${query.id}.svg`}
        alt=''
        loading='lazy'
        onError={(e) => {
          // No generated thumbnail yet: show the plain basemap for the region
          // rather than a broken image.
          const img = e.currentTarget;
          const fallback = questionThumbnailUrl(query.question);
          if (img.src !== fallback) img.src = fallback;
        }}
      />
    </div>
  );
}
