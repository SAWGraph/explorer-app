import { useQueryStore } from '../../store/queryStore';
import { generateQuestion } from '../../utils/questionGenerator';

export function AnalysisQuestionBar() {
  const question = useQueryStore((s) => s.question);
  const openEditModal = useQueryStore((s) => s.openEditModal);
  const isRunning = useQueryStore((s) => s.isRunning);
  const text = generateQuestion(question);

  return (
    <div className="question-bar">
      <div className="question-bar-left">
        <span className="question-bar-label">Analysis Question</span>
        <div className="question-bar-row">
          <span className="question-bar-text">{text}</span>
          <button className="btn-link" onClick={openEditModal} disabled={isRunning}>
            Edit
          </button>
        </div>
      </div>
      <div className="question-bar-right">
        <button className="btn-secondary" disabled>
          Save
        </button>
        <button className="btn-secondary" disabled>
          Export
        </button>
        <button className="btn-secondary" disabled>
          Publish
        </button>
      </div>
    </div>
  );
}
