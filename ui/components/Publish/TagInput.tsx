import { useState } from 'react';
import type { KeyboardEvent } from 'react';

interface TagInputProps {
  tags: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  max?: number;
}

export function TagInput({
  tags,
  onChange,
  placeholder = 'Type here to add tags',
  disabled = false,
  max = 10,
}: TagInputProps) {
  const [draft, setDraft] = useState('');

  const commit = () => {
    const value = draft.trim();
    if (!value) return;
    if (tags.includes(value)) {
      setDraft('');
      return;
    }
    if (tags.length >= max) {
      setDraft('');
      return;
    }
    onChange([...tags, value]);
    setDraft('');
  };

  const remove = (tag: string) => {
    onChange(tags.filter((t) => t !== tag));
  };

  const handleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commit();
      return;
    }
    if (e.key === 'Backspace' && draft === '' && tags.length > 0) {
      e.preventDefault();
      onChange(tags.slice(0, -1));
    }
  };

  return (
    <div className="tag-input">
      {tags.map((tag) => (
        <span key={tag} className="tag-chip">
          {tag}
          <button
            type="button"
            className="tag-chip-remove"
            onClick={() => remove(tag)}
            disabled={disabled}
            aria-label={`Remove tag ${tag}`}
          >
            ×
          </button>
        </span>
      ))}
      <input
        type="text"
        className="tag-input-field"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKey}
        onBlur={commit}
        placeholder={tags.length === 0 ? placeholder : ''}
        disabled={disabled}
      />
    </div>
  );
}
