import type { AnalysisQuestion } from '../../types/query';
import { generateQuestion } from '../../utils/questionGenerator';
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
