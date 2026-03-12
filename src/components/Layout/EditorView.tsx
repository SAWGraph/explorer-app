import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PREBUILT_QUERIES } from '../../constants/prebuiltQueries';
import { useQueryStore } from '../../store/queryStore';
import { AnalysisQuestionBar } from './AnalysisQuestionBar';
import { MainContent } from './MainContent';
import { EditModal } from '../../components/QueryEditor/EditModal';

export function EditorView() {
  const { queryId } = useParams<{ queryId: string }>();
  const navigate = useNavigate();

  useEffect(() => {
    if (!queryId || queryId === 'new') return;

    const prebuilt = PREBUILT_QUERIES.find((q) => q.id === queryId);
    if (!prebuilt) {
      navigate('/', { replace: true });
      return;
    }

    const { activeQueryId, loadQuestion } = useQueryStore.getState();
    if (activeQueryId !== queryId) {
      loadQuestion(queryId, prebuilt.question);
    }
  }, [queryId, navigate]);

  return (
    <>
      <AnalysisQuestionBar />
      <MainContent />
      <EditModal />
    </>
  );
}
