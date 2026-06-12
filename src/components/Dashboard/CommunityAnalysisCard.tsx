import type { PublishedListItem } from '../../api/publishClient';
import { getTagColor } from '../../utils/tagColor';

interface CommunityAnalysisCardProps {
  item: PublishedListItem;
  onClick: () => void;
}

const MAX_VISIBLE_TAGS = 3;

export function CommunityAnalysisCard({ item, onClick }: CommunityAnalysisCardProps) {
  const visibleTags = item.tags.slice(0, MAX_VISIBLE_TAGS);
  const hiddenCount = item.tags.length - MAX_VISIBLE_TAGS;

  return (
    <div className='query-card community-card' onClick={onClick}>
      <h3 className='query-card-title'>{item.title}</h3>
      <p className='community-card-author'>by {item.author}</p>
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
