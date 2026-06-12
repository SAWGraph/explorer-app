import { useEffect, useState } from 'react';
import { useQueryStore } from '../../store/queryStore';
import { generateQuestion } from '../../utils/questionGenerator';
import { ExportDropdown } from './ExportDropdown';
import { SaveQuestionModal } from '../QueryEditor/SaveQuestionModal';
import { PublishWorkflowModal } from '../Publish/PublishWorkflowModal';
import {
  useCreateSavedQuestion,
  useUpdateSavedQuestion,
} from '../../hooks/useSavedQuestions';
import { usePublishWorkflow } from '../../hooks/usePublishWorkflow';
import {
  isSavedQuestionId,
  parseSavedQueryParam,
  toSavedQueryParam,
} from '../../types/savedQuestion';
import { PREBUILT_QUERIES } from '../../constants/prebuiltQueries';

const SAVED_INDICATOR_MS = 1500;

export function AnalysisQuestionBar() {
  const question = useQueryStore((s) => s.question);
  const activeQueryId = useQueryStore((s) => s.activeQueryId);
  const openEditModal = useQueryStore((s) => s.openEditModal);
  const isRunning = useQueryStore((s) => s.isRunning);
  const text = generateQuestion(question);

  const [modalOpen, setModalOpen] = useState(false);
  const [savedIndicator, setSavedIndicator] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishedUrl, setPublishedUrl] = useState<string | null>(null);

  const createMutation = useCreateSavedQuestion();
  const updateMutation = useUpdateSavedQuestion();
  const publishMutation = usePublishWorkflow();

  const isExistingSave = isSavedQuestionId(activeQueryId);

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
        setSavedIndicator(true);
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : 'Failed to save.');
      }
      return;
    }
    setModalOpen(true);
  };

  const defaultName = (): string => {
    if (activeQueryId) {
      const prebuilt = PREBUILT_QUERIES.find((q) => q.id === activeQueryId);
      if (prebuilt) return prebuilt.title;
    }
    const generated = generateQuestion(question);
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
      setModalOpen(false);
      setSavedIndicator(true);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save.');
    }
  };

  const saveBusy = createMutation.isPending || updateMutation.isPending;
  const saveLabel = savedIndicator ? 'Saved' : isExistingSave ? 'Save' : 'Save';

  return (
    <div className="question-bar">
      <div className="question-bar-left">
        <span className="question-bar-label">Analysis Question</span>
        <div className="question-bar-row">
          <span className="question-bar-text">{text}</span>
          <button
            className="btn-secondary"
            onClick={openEditModal}
            disabled={isRunning}
            title="Edit analysis question"
          >
            Edit
          </button>
        </div>
      </div>
      <div className="question-bar-right">
        <button
          className="btn-secondary"
          onClick={handleSaveClick}
          disabled={isRunning || saveBusy}
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
          disabled={isRunning}
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
              if (!isExistingSave) {
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
                setSavedIndicator(true);
              }
              const result = await publishMutation.mutateAsync({
                author: values.author,
                title: values.title,
                description: values.description,
                tags: values.tags,
                question,
              });
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
