import { useEffect, useMemo, useRef, useState } from 'react';
import { PREBUILT_QUERIES, type PrebuiltQuery } from '../../constants/prebuiltQueries';
import { PrebuiltQueryCard } from './PrebuiltQueryCard';

interface SearchQuestionsModalProps {
  onClose: () => void;
  onSelect: (query: PrebuiltQuery) => void;
}

function matchesQuery(query: PrebuiltQuery, term: string): boolean {
  const haystack = [query.title, query.description, ...query.tags]
    .join(' ')
    .toLowerCase();
  return haystack.includes(term);
}

export function SearchQuestionsModal({ onClose, onSelect }: SearchQuestionsModalProps) {
  const [search, setSearch] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const trimmed = search.trim().toLowerCase();
  const results = useMemo(() => {
    if (!trimmed) return PREBUILT_QUERIES;
    return PREBUILT_QUERIES.filter((q) => matchesQuery(q, trimmed));
  }, [trimmed]);

  const heading = trimmed
    ? `Showing ${results.length} Search Result${results.length === 1 ? '' : 's'}`
    : 'Suggestions';

  return (
    <div className='modal-overlay' onClick={onClose}>
      <div
        className='modal-content search-modal'
        onClick={(e) => e.stopPropagation()}
        role='dialog'
        aria-modal='true'
        aria-label='Search Predefined Analysis Questions'
      >
        <div className='search-modal-header'>
          <div className='search-modal-title'>
            <span className='search-modal-icon' aria-hidden='true'>
              <svg viewBox='0 0 20 20' width='18' height='18' fill='none' stroke='currentColor' strokeWidth='2'>
                <circle cx='9' cy='9' r='6' />
                <path d='m14 14 4 4' strokeLinecap='round' />
              </svg>
            </span>
            <h2>Search Predefined Analysis Questions</h2>
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
            placeholder='Search Predefined Analysis Questions'
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

        <div className='search-modal-body'>
          <h4 className='search-modal-heading'>{heading}</h4>
          {results.length === 0 ? (
            <p className='search-modal-empty'>No analysis questions match your search.</p>
          ) : (
            <div className='query-cards-list'>
              {results.map((query) => (
                <PrebuiltQueryCard
                  key={query.id}
                  query={query}
                  onClick={() => onSelect(query)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
