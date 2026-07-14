import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PREBUILT_QUERIES } from '../../constants/prebuiltQueries';
import { DefinedTerm } from '../common/DefinedTerm';
import { PrebuiltQueryCard } from './PrebuiltQueryCard';
import { CommunityAnalysisCard } from './CommunityAnalysisCard';
import {
  SearchQuestionsModal,
  type SearchFilter,
} from './SearchQuestionsModal';
import { SavedQuestionRow } from './SavedQuestionRow';
import { HowItWorksModal } from '../Layout/HowItWorksModal';
import { WalkthroughBubble } from '../Layout/WalkthroughBubble';
import { startTour } from '../../tours/tours';
import { useQueryStore } from '../../store/queryStore';
import {
  useDeleteSavedQuestion,
  useSavedQuestionsList,
  useUpdateSavedQuestion,
} from '../../hooks/useSavedQuestions';
import { usePublishedWorkflowsList } from '../../hooks/usePublishWorkflow';
import { toSavedQueryParam } from '../../types/savedQuestion';

export function Dashboard() {
  const navigate = useNavigate();
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchFilter, setSearchFilter] = useState<SearchFilter>('all');
  const isTourOpen = useQueryStore((s) => s.isTourOpen);
  const openTour = useQueryStore((s) => s.openTour);
  const closeTour = useQueryStore((s) => s.closeTour);
  const setPendingTour = useQueryStore((s) => s.setPendingTour);
  const savedQuery = useSavedQuestionsList();
  const updateMutation = useUpdateSavedQuestion();
  const deleteMutation = useDeleteSavedQuestion();
  const communityQuery = usePublishedWorkflowsList(2);

  const savedItems = savedQuery.data ?? [];
  const communityTop = communityQuery.data ?? [];
  const communityLoading = communityQuery.isLoading;

  const openSearchWith = (filter: SearchFilter) => {
    setSearchFilter(filter);
    setSearchOpen(true);
  };

  const gridIcon = (
    <svg
      className='btn-icon'
      viewBox='0 0 18 18'
      fill='currentColor'
      width='18'
      height='18'
      aria-hidden='true'
    >
      <rect x='1' y='1' width='7' height='7' rx='1.5' />
      <rect x='10' y='1' width='7' height='7' rx='1.5' />
      <rect x='1' y='10' width='7' height='7' rx='1.5' />
      <rect x='10' y='10' width='7' height='7' rx='1.5' />
    </svg>
  );

  return (
    <div className='dashboard'>
      <div className='dashboard-content'>
        <h2 className='dashboard-welcome'>Welcome to Sawgraph!</h2>

        <section className='dashboard-section' data-tour='recent'>
          <div className='dashboard-section-header'>
            <h3>Pick up where you left off</h3>
            <a
              href='/q/new'
              className='section-link'
              onClick={(e) => {
                e.preventDefault();
                navigate('/q/new');
              }}
            >
              + Start a new analysis
            </a>
          </div>
          {savedItems.length === 0 ? (
            <div className='recent-work-placeholder'>
              <p>
                This section lists your recent work. Open an analysis to see it
                here.
              </p>
            </div>
          ) : (
            <div className='saved-list'>
              {savedItems.map((saved) => (
                <SavedQuestionRow
                  key={saved.id}
                  saved={saved}
                  onOpen={() => navigate(`/q/${toSavedQueryParam(saved.id)}`)}
                  onRename={(name) =>
                    updateMutation.mutate({ id: saved.id, patch: { name } })
                  }
                  onDelete={() => deleteMutation.mutate(saved.id)}
                />
              ))}
            </div>
          )}
        </section>

        <section className='dashboard-section' data-tour='prebuilt'>
          <div className='dashboard-section-header'>
            <h3>
              Prebuilt{' '}
              <DefinedTerm term='analysisQuestion'>Analyses</DefinedTerm>
            </h3>
            <button
              className='btn-view-more'
              data-tour='view-more'
              onClick={() => openSearchWith('prebuilt')}
            >
              {gridIcon}
              Explore More Prebuilt Analyses
            </button>
          </div>

          <div className='query-cards-list'>
            {PREBUILT_QUERIES.slice(0, 4).map((query) => (
              <PrebuiltQueryCard
                key={query.id}
                query={query}
                onClick={() => navigate(`/q/${query.id}`)}
              />
            ))}
          </div>
        </section>

        <section className='dashboard-section'>
          <div className='dashboard-section-header'>
            <h3>Community Analyses</h3>
            <button
              className='btn-view-more'
              onClick={() => openSearchWith('community')}
            >
              {gridIcon}
              Explore More Community Analyses
            </button>
          </div>

          {communityLoading ? (
            <div className='dashboard-empty'>Loading…</div>
          ) : communityTop.length === 0 ? (
            <div className='dashboard-empty'>
              No community analyses yet — publish one to see it here.
            </div>
          ) : (
            <div className='query-cards-list'>
              {communityTop.map((item) => (
                <CommunityAnalysisCard
                  key={item.id}
                  item={item}
                  onClick={() => navigate(`/p/${item.id}`)}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      {searchOpen && (
        <SearchQuestionsModal
          initialFilter={searchFilter}
          onClose={() => setSearchOpen(false)}
          onSelectPrebuilt={(query) => {
            setSearchOpen(false);
            navigate(`/q/${query.id}`);
          }}
          onSelectCommunity={(item) => {
            setSearchOpen(false);
            navigate(`/p/${item.id}`);
          }}
        />
      )}

      {isTourOpen && (
        <HowItWorksModal
          onClose={closeTour}
          onStart={(id) => {
            closeTour();
            if (id === 'dashboard') {
              startTour('dashboard', {
                openSearchModal: () => setSearchOpen(true),
                // Return to a clean dashboard and reopen the hub for the next track.
                onFinish: () => {
                  setSearchOpen(false);
                  openTour();
                },
              });
            } else {
              // Map/edit tours live on the editor route; hand off via the store.
              setPendingTour(id);
              navigate(id === 'edit' ? '/q/new' : `/q/${PREBUILT_QUERIES[0].id}`);
            }
          }}
        />
      )}

      <WalkthroughBubble />
    </div>
  );
}
