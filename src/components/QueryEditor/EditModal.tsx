import { useEffect, useCallback, useMemo } from 'react';
import { useQueryStore } from '../../store/queryStore';
import { useQueryPipeline } from '../../hooks/useQueryPipeline';
import { QueryEditorContent } from './QueryEditorContent';
import { PipelineTimeline } from '../Pipeline/PipelineTimeline';
import { assessQueryBreadth } from '../../engine/queryBreadth';

export function EditModal() {
  const isOpen = useQueryStore((s) => s.isEditModalOpen);
  const closeEditModal = useQueryStore((s) => s.closeEditModal);
  const discardEditModal = useQueryStore((s) => s.discardEditModal);
  const commitSnapshot = useQueryStore((s) => s.commitSnapshot);
  const setLastApplyError = useQueryStore((s) => s.setLastApplyError);
  const clearLastApplyError = useQueryStore((s) => s.clearLastApplyError);
  const lastApplyError = useQueryStore((s) => s.lastApplyError);
  const stepProgress = useQueryStore((s) => s.stepProgress);
  const question = useQueryStore((s) => s.question);
  const questionSnapshot = useQueryStore((s) => s.questionSnapshot);
  const { runPipeline, isRunning } = useQueryPipeline();

  const hasChanges = useMemo(() => {
    if (!questionSnapshot) return false;
    return JSON.stringify(question) !== JSON.stringify(questionSnapshot);
  }, [question, questionSnapshot]);

  const breadthWarning = useMemo(
    () => (question ? assessQueryBreadth(question) : null),
    [question],
  );

  const handleDiscard = useCallback(() => {
    if (!isRunning) discardEditModal();
  }, [isRunning, discardEditModal]);

  const handleApply = useCallback(async () => {
    clearLastApplyError();
    const result = await runPipeline();
    commitSnapshot();
    if (result.status === 'success' || result.status === 'empty') {
      closeEditModal();
    } else {
      setLastApplyError(result);
    }
  }, [runPipeline, commitSnapshot, closeEditModal, setLastApplyError, clearLastApplyError]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isRunning) discardEditModal();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, isRunning, discardEditModal]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={(e) => {
      if (e.target === e.currentTarget && !isRunning) discardEditModal();
    }}>
      <div className="modal-content">
        <div className="modal-header">
          <h2>Edit Analysis Question</h2>
          <button className="modal-close" onClick={handleDiscard} disabled={isRunning}>
            &times;
          </button>
        </div>

        <div className="modal-body">
          {isRunning ? (
            <PipelineTimeline steps={stepProgress} isRunning={isRunning} />
          ) : (
            <>
              {lastApplyError && (
                <div className="pipeline-message pipeline-error apply-error-callout">
                  <div className="apply-error-content">
                    <strong>Error:</strong> {lastApplyError.message}
                    {lastApplyError.error && <pre>{lastApplyError.error.message}</pre>}
                  </div>
                  <button
                    className="apply-error-dismiss"
                    onClick={clearLastApplyError}
                    aria-label="Dismiss error"
                  >
                    &times;
                  </button>
                </div>
              )}
              {breadthWarning && !lastApplyError && (
                <div className="pipeline-message pipeline-empty apply-error-callout">
                  <div className="apply-error-content">
                    <strong>Heads up:</strong> {breadthWarning}
                  </div>
                </div>
              )}
              <QueryEditorContent />
            </>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={handleDiscard} disabled={isRunning}>
            Discard Changes
          </button>
          <button
            className="btn-primary"
            onClick={handleApply}
            disabled={isRunning || (!hasChanges && !lastApplyError)}
          >
            {isRunning ? 'Running...' : lastApplyError ? 'Retry' : 'Apply'}
          </button>
        </div>
      </div>
    </div>
  );
}
