import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PREBUILT_QUERIES } from '../../constants/prebuiltQueries';
import { useQueryStore } from '../../store/queryStore';
import { AnalysisQuestionBar } from './AnalysisQuestionBar';
import { MainContent } from './MainContent';
import { EditModal } from '../../components/QueryEditor/EditModal';
import { savedQuestionsRepo } from '../../storage/savedQuestionsStore';
import {
  isSavedQuestionId,
  parseSavedQueryParam,
} from '../../types/savedQuestion';

export function EditorView() {
  const { queryId } = useParams<{ queryId: string }>();
  const navigate = useNavigate();

  useEffect(() => {
    if (!queryId || queryId === 'new') return;

    const { loadQuestion } = useQueryStore.getState();

    if (isSavedQuestionId(queryId)) {
      const savedId = parseSavedQueryParam(queryId);
      const saved = savedId ? savedQuestionsRepo.get(savedId) : null;
      if (!saved) {
        navigate('/', { replace: true });
        return;
      }
      loadQuestion(queryId, saved.question);
      return;
    }

    const prebuilt = PREBUILT_QUERIES.find((q) => q.id === queryId);
    if (!prebuilt) {
      navigate('/', { replace: true });
      return;
    }

    loadQuestion(queryId, prebuilt.question);
  }, [queryId, navigate]);

  return (
    <>
      <AnalysisQuestionBar />
      <MainContent />
      <EditModal />
    </>
  );
}
