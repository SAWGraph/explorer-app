import { useEffect, useRef, useState } from 'react';
import { useQueryStore } from '../../store/queryStore';
import { generateQuestion } from '../../utils/questionGenerator';
import { useQuestionTotals } from '../../hooks/useQuestionTotals';
import { ExportDropdown } from './ExportDropdown';
import { SaveQuestionModal } from '../QueryEditor/SaveQuestionModal';
import { PublishWorkflowModal } from '../Publish/PublishWorkflowModal';
import {
  useCreateSavedQuestion,
  useUpdateSavedQuestion,
} from '../../hooks/useSavedQuestions';
import {
  usePublishWorkflow,
  useRenamePublishedWorkflow,
} from '../../hooks/usePublishWorkflow';
import {
  isSavedQuestionId,
  parseSavedQueryParam,
  toSavedQueryParam,
} from '../../types/savedQuestion';
import { deepEqual } from '../../utils/clone';
import { publishEditTokens } from '../../storage/publishEditTokens';

const PUBLISHED_ID_PREFIX = 'published:';

function isPublishedId(id: string | null | undefined): boolean {
  return !!id && id.startsWith(PUBLISHED_ID_PREFIX);
}

const SAVED_INDICATOR_MS = 1500;

export function AnalysisQuestionBar() {
  const question = useQueryStore((s) => s.question);
  const baselineQuestion = useQueryStore((s) => s.baselineQuestion);
  const activeQueryId = useQueryStore((s) => s.activeQueryId);
  const activeQueryName = useQueryStore((s) => s.activeQueryName);
  const setActiveQueryName = useQueryStore((s) => s.setActiveQueryName);
  const openEditModal = useQueryStore((s) => s.openEditModal);
  const markBaseline = useQueryStore((s) => s.markBaseline);
  const isRunning = useQueryStore((s) => s.isRunning);
  const totals = useQuestionTotals(question);
  const text = generateQuestion(question, totals);
  const isDirty = !deepEqual(question, baselineQuestion);

  const [modalOpen, setModalOpen] = useState(false);
  const [savedIndicator, setSavedIndicator] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishedUrl, setPublishedUrl] = useState<string | null>(null);

  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  const createMutation = useCreateSavedQuestion();
  const updateMutation = useUpdateSavedQuestion();
  const publishMutation = usePublishWorkflow();
  const renamePublishedMutation = useRenamePublishedWorkflow();

  const isExistingSave = isSavedQuestionId(activeQueryId);
  const isPublished = isPublishedId(activeQueryId);
  const publishedId = isPublished && activeQueryId
    ? activeQueryId.slice(PUBLISHED_ID_PREFIX.length)
    : null;
  const ownsPublished = !!(publishedId && publishEditTokens.get(publishedId));
  const canRename = isExistingSave || ownsPublished;
  const isPrebuilt = !isExistingSave && !isPublished;
  const isDirtyPrebuilt = isPrebuilt && isDirty;
  const isPristinePrebuilt = isPrebuilt && !isDirty;
  const isPristinePublished = isPublished && !isDirty;
  const displayName = isDirtyPrebuilt ? 'Untitled' : activeQueryName;

  useEffect(() => {
    if (!savedIndicator) return;
    const t = setTimeout(() => setSavedIndicator(false), SAVED_INDICATOR_MS);
    return () => clearTimeout(t);
  }, [savedIndicator]);

  const handleSaveClick = async () => {
    setSaveError(null);
    if (isExistingSave && activeQueryId) {
      const savedId = parseSavedQueryParam(activeQueryId);
      if (!savedId) return;
      try {
        await updateMutation.mutateAsync({
          id: savedId,
          patch: { question },
        });
        markBaseline();
        setSavedIndicator(true);
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : 'Failed to save.');
      }
      return;
    }
    setModalOpen(true);
  };

  const defaultName = (): string => {
    if (isDirtyPrebuilt) return 'Untitled';
    if (activeQueryName) return activeQueryName;
    const generated = generateQuestion(question, totals);
    return generated.length > 80 ? generated.slice(0, 80) + '…' : generated;
  };

  const handleConfirmSave = async (name: string) => {
    setSaveError(null);
    try {
      const created = await createMutation.mutateAsync({
        name,
        question,
        basedOnQueryId: activeQueryId && !isSavedQuestionId(activeQueryId)
          ? activeQueryId
          : null,
      });
      useQueryStore.getState().setActiveQueryId(toSavedQueryParam(created.id));
      setActiveQueryName(name);
      markBaseline();
      setModalOpen(false);
      setSavedIndicator(true);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save.');
    }
  };

  const saveBusy = createMutation.isPending || updateMutation.isPending;
  const saveLabel = savedIndicator ? 'Saved' : 'Save';

  const startRename = () => {
    if (!canRename || !activeQueryName) return;
    setRenameValue(activeQueryName);
    setRenameError(null);
    setRenaming(true);
    requestAnimationFrame(() => renameInputRef.current?.select());
  };

  const cancelRename = () => {
    setRenaming(false);
    setRenameError(null);
  };

  const commitRename = async () => {
    const next = renameValue.trim();
    if (!next) {
      setRenameError('Name cannot be empty');
      return;
    }
    if (next === activeQueryName) {
      cancelRename();
      return;
    }
    try {
      if (isExistingSave && activeQueryId) {
        const savedId = parseSavedQueryParam(activeQueryId);
        if (!savedId) return;
        await updateMutation.mutateAsync({ id: savedId, patch: { name: next } });
      } else if (publishedId) {
        const token = publishEditTokens.get(publishedId);
        if (!token) {
          setRenameError('You do not own this publish.');
          return;
        }
        await renamePublishedMutation.mutateAsync({
          id: publishedId,
          title: next,
          editToken: token,
        });
      }
      setActiveQueryName(next);
      setRenaming(false);
      setRenameError(null);
    } catch (err) {
      setRenameError(err instanceof Error ? err.message : 'Rename failed');
    }
  };

  const renameBusy =
    updateMutation.isPending || renamePublishedMutation.isPending;

  return (
    <div className="question-bar">
      <div className="question-bar-left">
        <span className="question-bar-label">Analysis Question</span>
        {displayName && (
          <div className="question-bar-name-row">
            {renaming ? (
              <>
                <input
                  ref={renameInputRef}
                  className="question-bar-name-input"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void commitRename();
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      cancelRename();
                    }
                  }}
                  onBlur={() => void commitRename()}
                  disabled={renameBusy}
                  maxLength={200}
                  autoFocus
                />
                {renameError && (
                  <span className="question-bar-rename-error">{renameError}</span>
                )}
              </>
            ) : (
              <>
                <span className="question-bar-name">{displayName}</span>
                {canRename && (
                  <button
                    type="button"
                    className="question-bar-rename-btn"
                    onClick={startRename}
                    disabled={isRunning || renameBusy}
                    title="Rename"
                    aria-label="Rename analysis question"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M12 20h9" />
                      <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                    </svg>
                  </button>
                )}
              </>
            )}
          </div>
        )}
        <div className="question-bar-row">
          <span className="question-bar-text">{text}</span>
        </div>
      </div>
      <button
        className="btn-secondary question-bar-edit"
        onClick={openEditModal}
        disabled={isRunning}
        title="Customize analysis question"
      >
        Customize
      </button>
      <div className="question-bar-right">
        <button
          className="btn-secondary"
          onClick={handleSaveClick}
          disabled={
            isRunning ||
            saveBusy ||
            isPristinePrebuilt ||
            isPristinePublished ||
            (isExistingSave && !isDirty)
          }
          title={
            isPristinePrebuilt
              ? 'Make changes to a prebuilt question before saving'
              : isPristinePublished
                ? 'Make changes before saving a copy'
                : isExistingSave && !isDirty
                  ? 'No changes to save'
                  : undefined
          }
        >
          {saveBusy ? 'Saving...' : saveLabel}
        </button>
        <ExportDropdown />
        <button
          className="btn-primary"
          onClick={() => {
            setPublishError(null);
            setPublishedUrl(null);
            setPublishOpen(true);
          }}
          disabled={isRunning || isPristinePrebuilt || isPristinePublished}
          title={
            isPristinePrebuilt
              ? 'Make changes to a prebuilt question before publishing'
              : isPristinePublished
                ? 'Make changes before publishing a copy'
                : undefined
          }
        >
          Publish
        </button>
      </div>

      {modalOpen && (
        <SaveQuestionModal
          initialName={defaultName()}
          isSaving={createMutation.isPending}
          error={saveError}
          onCancel={() => {
            setModalOpen(false);
            setSaveError(null);
          }}
          onSave={handleConfirmSave}
        />
      )}

      {publishOpen && (
        <PublishWorkflowModal
          isSaved={isExistingSave}
          defaultTitle={defaultName()}
          isSubmitting={publishMutation.isPending || createMutation.isPending}
          error={publishError}
          publishedUrl={publishedUrl}
          onCancel={() => {
            setPublishOpen(false);
            setPublishError(null);
          }}
          onClose={() => {
            setPublishOpen(false);
            setPublishError(null);
            setPublishedUrl(null);
          }}
          onSubmit={async (values) => {
            setPublishError(null);
            try {
              if (isExistingSave && activeQueryId) {
                const savedId = parseSavedQueryParam(activeQueryId);
                if (savedId) {
                  await updateMutation.mutateAsync({
                    id: savedId,
                    patch: { question },
                  });
                }
              } else {
                const created = await createMutation.mutateAsync({
                  name: values.title,
                  question,
                  basedOnQueryId:
                    activeQueryId && !isSavedQuestionId(activeQueryId)
                      ? activeQueryId
                      : null,
                });
                useQueryStore
                  .getState()
                  .setActiveQueryId(toSavedQueryParam(created.id));
                setActiveQueryName(values.title);
                setSavedIndicator(true);
              }
              const result = await publishMutation.mutateAsync({
                author: values.author,
                title: values.title,
                description: values.description,
                tags: values.tags,
                question,
              });
              markBaseline();
              setPublishedUrl(result.url);
            } catch (err) {
              setPublishError(
                err instanceof Error ? err.message : 'Failed to publish.',
              );
            }
          }}
        />
      )}
    </div>
  );
}
