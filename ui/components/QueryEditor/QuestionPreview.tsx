import type { AnalysisQuestion } from '../../../engine/types/query';
import { generateQuestion } from '../../../engine/questionGenerator';
import { useQuestionTotals } from '../../hooks/useQuestionTotals';

interface QuestionPreviewProps {
  question: AnalysisQuestion;
}

export function QuestionPreview({ question }: QuestionPreviewProps) {
  const totals = useQuestionTotals(question);
  const text = generateQuestion(question, totals);

  return (
    <div className="question-preview">
      <div className="question-label">Analysis Question</div>
      <div className="question-text">{text}</div>
    </div>
  );
}
