import { useEffect, useState } from 'react';
import { TagInput } from './TagInput';

interface PublishFormValues {
  author: string;
  title: string;
  description: string;
  tags: string[];
}

interface PublishWorkflowModalProps {
  isSaved: boolean;
  defaultTitle: string;
  isSubmitting: boolean;
  error: string | null;
  publishedUrl: string | null;
  onCancel: () => void;
  onSubmit: (values: PublishFormValues) => void;
  onClose: () => void;
}

export function PublishWorkflowModal({
  isSaved,
  defaultTitle,
  isSubmitting,
  error,
  publishedUrl,
  onCancel,
  onSubmit,
  onClose,
}: PublishWorkflowModalProps) {
  const [author, setAuthor] = useState('');
  const [title, setTitle] = useState(defaultTitle);
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting) {
        publishedUrl ? onClose() : onCancel();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isSubmitting, onCancel, onClose, publishedUrl]);

  const trimmedTitle = title.trim();
  const trimmedAuthor = author.trim();
  const canSubmit =
    trimmedAuthor.length > 0 && trimmedTitle.length > 0 && !isSubmitting;

  const handleSubmit = (e: { preventDefault: () => void }) => {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit({
      author: trimmedAuthor,
      title: trimmedTitle,
      description: description.trim(),
      tags,
    });
  };

  const handleCopy = async () => {
    if (!publishedUrl) return;
    try {
      await navigator.clipboard.writeText(publishedUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  const primaryLabel = isSaved ? 'Publish' : 'Save & Publish';

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target !== e.currentTarget || isSubmitting) return;
        publishedUrl ? onClose() : onCancel();
      }}
    >
      <div className="modal-content publish-modal-content">
        {publishedUrl ? (
          <div className="publish-success">
            <div className="publish-success-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="28" height="28" fill="none">
                <path
                  d="M20 6 9 17l-5-5"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <h2 className="publish-success-title">Workflow published</h2>
            <p className="publish-success-link">
              Here's Shareable Link &ndash;{' '}
              <a
                href={publishedUrl}
                target="_blank"
                rel="noreferrer"
                className="publish-link"
              >
                {publishedUrl}
              </a>
            </p>
            <button
              type="button"
              className="btn-primary publish-copy-button"
              onClick={handleCopy}
            >
              {copied ? 'Copied!' : 'Copy Link'}
            </button>
          </div>
        ) : (
          <>
            <div className="publish-modal-header">
              <div className="publish-modal-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="24" height="24" fill="none">
                  <rect
                    x="3"
                    y="5"
                    width="18"
                    height="14"
                    rx="2"
                    stroke="currentColor"
                    strokeWidth="2"
                  />
                  <path
                    d="M3 10h18"
                    stroke="currentColor"
                    strokeWidth="2"
                  />
                </svg>
              </div>
              <h2 className="publish-modal-title">Publish Workflow</h2>
              <p className="publish-modal-subtitle">
                Publish your workflow and make it visible to the community
              </p>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="modal-body publish-modal-body">
                <label className="publish-field-label" htmlFor="publish-author">
                  Email Address or Name
                </label>
                <input
                  id="publish-author"
                  type="text"
                  className="publish-field-input"
                  value={author}
                  onChange={(e) => setAuthor(e.target.value)}
                  placeholder="Enter your name"
                  maxLength={120}
                  disabled={isSubmitting}
                  autoFocus
                />

                <label className="publish-field-label" htmlFor="publish-title">
                  Title
                </label>
                <input
                  id="publish-title"
                  type="text"
                  className="publish-field-input"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Enter title for your workflow"
                  maxLength={200}
                  disabled={isSubmitting}
                />

                <label className="publish-field-label" htmlFor="publish-description">
                  Description
                </label>
                <textarea
                  id="publish-description"
                  className="publish-field-input publish-field-textarea"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Add description here"
                  rows={3}
                  maxLength={2000}
                  disabled={isSubmitting}
                />

                <label className="publish-field-label">Tags</label>
                <TagInput
                  tags={tags}
                  onChange={setTags}
                  disabled={isSubmitting}
                />

                {error && (
                  <div className="pipeline-message pipeline-error apply-error-callout">
                    <div className="apply-error-content">
                      <strong>Error:</strong> {error}
                    </div>
                  </div>
                )}
              </div>

              <div className="modal-footer publish-modal-footer">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={onCancel}
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={!canSubmit}
                >
                  {isSubmitting ? 'Publishing...' : primaryLabel}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
