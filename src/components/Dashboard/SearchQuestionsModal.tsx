import { useEffect, useMemo, useRef, useState } from 'react';
import { PREBUILT_QUERIES, type PrebuiltQuery } from '../../constants/prebuiltQueries';
import { PrebuiltQueryCard } from './PrebuiltQueryCard';
import { CommunityAnalysisCard } from './CommunityAnalysisCard';
import { usePublishedWorkflowsList } from '../../hooks/usePublishWorkflow';
import type { PublishedListItem } from '../../api/publishClient';

export type SearchFilter = 'all' | 'prebuilt' | 'community';

interface SearchQuestionsModalProps {
  initialFilter?: SearchFilter;
  onClose: () => void;
  onSelectPrebuilt: (query: PrebuiltQuery) => void;
  onSelectCommunity: (item: PublishedListItem) => void;
}

function matchesPrebuilt(query: PrebuiltQuery, term: string): boolean {
  const haystack = [query.title, query.description, ...query.tags]
    .join(' ')
    .toLowerCase();
  return haystack.includes(term);
}

function matchesCommunity(item: PublishedListItem, term: string): boolean {
  const haystack = [item.title, item.author, item.description ?? '', ...item.tags]
    .join(' ')
    .toLowerCase();
  return haystack.includes(term);
}

const FILTERS: { id: SearchFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'prebuilt', label: 'Prebuilt' },
  { id: 'community', label: 'Community' },
];

export function SearchQuestionsModal({
  initialFilter = 'all',
  onClose,
  onSelectPrebuilt,
  onSelectCommunity,
}: SearchQuestionsModalProps) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<SearchFilter>(initialFilter);
  const inputRef = useRef<HTMLInputElement>(null);
  const { data: communityItems = [] } = usePublishedWorkflowsList(100);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const trimmed = search.trim().toLowerCase();

  const showPrebuilt = filter === 'all' || filter === 'prebuilt';
  const showCommunity = filter === 'all' || filter === 'community';

  const prebuiltResults = useMemo(() => {
    if (!showPrebuilt) return [];
    if (!trimmed) return PREBUILT_QUERIES;
    return PREBUILT_QUERIES.filter((q) => matchesPrebuilt(q, trimmed));
  }, [trimmed, showPrebuilt]);

  const communityResults = useMemo(() => {
    if (!showCommunity) return [];
    if (!trimmed) return communityItems;
    return communityItems.filter((q) => matchesCommunity(q, trimmed));
  }, [trimmed, showCommunity, communityItems]);

  const total = prebuiltResults.length + communityResults.length;
  const heading = trimmed
    ? `Showing ${total} Search Result${total === 1 ? '' : 's'}`
    : 'Suggestions';

  return (
    <div className='modal-overlay' onClick={onClose}>
      <div
        className='modal-content search-modal'
        onClick={(e) => e.stopPropagation()}
        role='dialog'
        aria-modal='true'
        aria-label='Search Analysis Questions'
      >
        <div className='search-modal-header'>
          <div className='search-modal-title'>
            <span className='search-modal-icon' aria-hidden='true'>
              <svg viewBox='0 0 20 20' width='18' height='18' fill='none' stroke='currentColor' strokeWidth='2'>
                <circle cx='9' cy='9' r='6' />
                <path d='m14 14 4 4' strokeLinecap='round' />
              </svg>
            </span>
            <h2>Search Analysis Questions</h2>
          </div>
          <button
            type='button'
            className='search-modal-close'
            onClick={onClose}
            aria-label='Close search'
          >
            <svg viewBox='0 0 20 20' width='16' height='16' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round'>
              <path d='M4 4 16 16M16 4 4 16' />
            </svg>
          </button>
        </div>

        <div className='search-modal-input-wrap'>
          <span className='search-modal-input-icon' aria-hidden='true'>
            <svg viewBox='0 0 20 20' width='16' height='16' fill='none' stroke='currentColor' strokeWidth='2'>
              <circle cx='9' cy='9' r='6' />
              <path d='m14 14 4 4' strokeLinecap='round' />
            </svg>
          </span>
          <input
            ref={inputRef}
            type='text'
            className='search-modal-input'
            placeholder='Search Analysis Questions'
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              type='button'
              className='search-modal-clear'
              onClick={() => setSearch('')}
              aria-label='Clear search'
            >
              <svg viewBox='0 0 20 20' width='14' height='14' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round'>
                <path d='M4 4 16 16M16 4 4 16' />
              </svg>
            </button>
          )}
        </div>

        <div className='search-filter-pills'>
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type='button'
              className={`search-filter-pill${filter === f.id ? ' is-active' : ''}`}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className='search-modal-body'>
          <h4 className='search-modal-heading'>{heading}</h4>
          {total === 0 ? (
            <p className='search-modal-empty'>No analysis questions match your search.</p>
          ) : (
            <div className='query-cards-list'>
              {prebuiltResults.map((query) => (
                <PrebuiltQueryCard
                  key={`p-${query.id}`}
                  query={query}
                  onClick={() => onSelectPrebuilt(query)}
                />
              ))}
              {communityResults.map((item) => (
                <CommunityAnalysisCard
                  key={`c-${item.id}`}
                  item={item}
                  onClick={() => onSelectCommunity(item)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
