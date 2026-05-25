import { useEffect, useRef, useState } from 'react';
import type { SavedQuestion } from '../../types/savedQuestion';
import { PREBUILT_QUERIES } from '../../constants/prebuiltQueries';

interface SavedQuestionRowProps {
  saved: SavedQuestion;
  onOpen: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min${min === 1 ? '' : 's'} ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hr${hr === 1 ? '' : 's'} ago`;
  const days = Math.floor(hr / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  return new Date(timestamp).toLocaleDateString();
}

export function SavedQuestionRow({
  saved,
  onOpen,
  onRename,
  onDelete,
}: SavedQuestionRowProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState(saved.name);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [menuOpen]);

  const basedOn =
    saved.basedOnQueryId
      ? PREBUILT_QUERIES.find((q) => q.id === saved.basedOnQueryId)?.title
      : null;

  const commitRename = () => {
    const trimmed = draftName.trim();
    if (trimmed && trimmed !== saved.name) {
      onRename(trimmed);
    } else {
      setDraftName(saved.name);
    }
    setRenaming(false);
  };

  return (
    <div className='saved-row' onClick={renaming ? undefined : onOpen}>
      <div className='saved-row-main'>
        {renaming ? (
          <input
            className='saved-row-rename-input'
            value={draftName}
            autoFocus
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename();
              else if (e.key === 'Escape') {
                setDraftName(saved.name);
                setRenaming(false);
              }
            }}
          />
        ) : (
          <span className='saved-row-name'>{saved.name}</span>
        )}
        <span className='saved-row-meta'>
          {basedOn && (
            <>
              <span className='saved-row-based-on'>Based on “{basedOn}”</span>
              <span className='saved-row-dot'>·</span>
            </>
          )}
          <span>Updated {formatRelativeTime(saved.updatedAt)}</span>
        </span>
      </div>
      <div className='saved-row-actions' ref={menuRef}>
        <button
          className='saved-row-menu-btn'
          aria-label='More actions'
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((v) => !v);
          }}
        >
          ⋯
        </button>
        {menuOpen && (
          <div className='saved-row-menu'>
            <button
              className='saved-row-menu-item'
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(false);
                setRenaming(true);
              }}
            >
              Rename
            </button>
            <button
              className='saved-row-menu-item saved-row-menu-item-danger'
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(false);
                if (window.confirm(`Delete “${saved.name}”?`)) {
                  onDelete();
                }
              }}
            >
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
