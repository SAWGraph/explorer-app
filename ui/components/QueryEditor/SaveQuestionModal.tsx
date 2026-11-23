import { useEffect, useRef, useState } from 'react';

interface SaveQuestionModalProps {
  initialName: string;
  isSaving: boolean;
  error: string | null;
  onCancel: () => void;
  onSave: (name: string) => void;
}

export function SaveQuestionModal({
  initialName,
  isSaving,
  error,
  onCancel,
  onSave,
}: SaveQuestionModalProps) {
  const [name, setName] = useState(initialName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSaving) onCancel();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isSaving, onCancel]);

  const trimmed = name.trim();
  const canSave = trimmed.length > 0 && !isSaving;

  const handleSubmit = (e: { preventDefault: () => void }) => {
    e.preventDefault();
    if (!canSave) return;
    onSave(trimmed);
  };

  return (
    <div
      className='modal-overlay'
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSaving) onCancel();
      }}
    >
      <div className='modal-content save-modal-content'>
        <div className='modal-header'>
          <h2>Save Analysis Question</h2>
          <button className='modal-close' onClick={onCancel} disabled={isSaving}>
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className='modal-body'>
            <label className='save-modal-label' htmlFor='save-question-name'>
              Title
            </label>
            <input
              id='save-question-name'
              ref={inputRef}
              type='text'
              className='save-modal-input'
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder='Give this analysis a memorable name'
              maxLength={120}
              disabled={isSaving}
            />
            <p className='save-modal-hint'>
              Saved locally in this browser. You can rename or delete it later from the
              Dashboard.
            </p>
            {error && (
              <div className='pipeline-message pipeline-error apply-error-callout'>
                <div className='apply-error-content'>
                  <strong>Error:</strong> {error}
                </div>
              </div>
            )}
          </div>

          <div className='modal-footer'>
            <button
              type='button'
              className='btn-secondary'
              onClick={onCancel}
              disabled={isSaving}
            >
              Cancel
            </button>
            <button type='submit' className='btn-primary' disabled={!canSave}>
              {isSaving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
