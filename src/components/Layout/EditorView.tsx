import { useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { PREBUILT_QUERIES } from '../../constants/prebuiltQueries';
import { blankAnalysisQuestion } from '../../constants/blankAnalysis';
import { useQueryStore } from '../../store/queryStore';
import { startTour } from '../../tours/tours';
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
  const { state } = useLocation();

  useEffect(() => {
    if (!queryId) return;

    const { loadQuestion, openEditModal, activeQueryId } = useQueryStore.getState();

    // A first save renames the URL of the analysis already on screen (see
    // AnalysisQuestionBar). Loading it again would rerun it and clear the map.
    if ((state as { keepLoaded?: boolean } | null)?.keepLoaded && activeQueryId === queryId) return;

    if (queryId === 'new') {
      loadQuestion('new', blankAnalysisQuestion(), 'New analysis', {
        autoRun: false,
      });
      openEditModal();
      return;
    }

    if (isSavedQuestionId(queryId)) {
      const savedId = parseSavedQueryParam(queryId);
      const saved = savedId ? savedQuestionsRepo.get(savedId) : null;
      if (!saved) {
        navigate('/', { replace: true });
        return;
      }
      loadQuestion(queryId, saved.question, saved.name);
      return;
    }

    const prebuilt = PREBUILT_QUERIES.find((q) => q.id === queryId);
    if (!prebuilt) {
      navigate('/', { replace: true });
      return;
    }

    loadQuestion(queryId, prebuilt.question, prebuilt.title);
  }, [queryId, navigate, state]);

  // A tour handed off from the dashboard hub runs here once its anchor mounts.
  const pendingTour = useQueryStore((s) => s.pendingTour);
  const setPendingTour = useQueryStore((s) => s.setPendingTour);
  const openTour = useQueryStore((s) => s.openTour);
  useEffect(() => {
    if (!pendingTour) return;
    const anchor =
      pendingTour === 'edit' ? '.query-editor .question-preview' : '[data-tour="publish"]';
    let tries = 0;
    const iv = setInterval(() => {
      if (document.querySelector(anchor)) {
        clearInterval(iv);
        startTour(pendingTour, {
          // On Finish, return to the dashboard and reopen the hub.
          onFinish: () => {
            navigate('/');
            openTour();
          },
          // The edit tour runs on a blank new analysis, so walking out of it
          // returns to the dashboard rather than leaving an empty map.
          ...(pendingTour === 'edit' && { onEscape: () => navigate('/') }),
        });
        setPendingTour(null);
      } else if (++tries > 50) {
        clearInterval(iv);
        setPendingTour(null);
      }
    }, 100);
    return () => clearInterval(iv);
  }, [pendingTour, setPendingTour, openTour, navigate]);

  return (
    <>
      <AnalysisQuestionBar />
      <MainContent />
      <EditModal />
    </>
  );
}
