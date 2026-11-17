import { useState } from 'react';
import type { PublishedListItem } from '../../api/publishClient';
import { getTagColor } from '../../utils/tagColor';

interface CommunityAnalysisCardProps {
  item: PublishedListItem;
  onClick: () => void;
}

const MAX_VISIBLE_TAGS = 3;

export function CommunityAnalysisCard({ item, onClick }: CommunityAnalysisCardProps) {
  const [expanded, setExpanded] = useState(false);

  const visibleTags = item.tags.slice(0, MAX_VISIBLE_TAGS);
  const hiddenCount = item.tags.length - MAX_VISIBLE_TAGS;

  return (
    <div className='query-card' onClick={onClick}>
      <h3 className='query-card-title'>{item.title}</h3>
      <p className='community-card-author'>by {item.author}</p>

      {item.description && (
        <button
          className='query-card-toggle'
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(!expanded);
          }}
        >
          See More Details {expanded ? '▴' : '▾'}
        </button>
      )}

      {expanded && item.description && (
        <p className='query-card-desc'>{item.description}</p>
      )}

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
