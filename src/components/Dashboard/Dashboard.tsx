import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PREBUILT_QUERIES } from '../../constants/prebuiltQueries';
import { DefinedTerm } from '../common/DefinedTerm';
import { PrebuiltQueryCard } from './PrebuiltQueryCard';
import { SearchQuestionsModal } from './SearchQuestionsModal';

export function Dashboard() {
  const navigate = useNavigate();
  const [searchOpen, setSearchOpen] = useState(false);

  return (
    <div className='dashboard'>
      <div className='dashboard-content'>
        <h2 className='dashboard-welcome'>Welcome to Sawgraph!</h2>

        <section className='dashboard-section'>
          <div className='dashboard-section-header'>
            <h3>Pick up where you left off</h3>
            <a href='#' className='section-link'>
              Take a quick walkthrough 🎉
            </a>
          </div>
          <div className='recent-work-placeholder'>
            <p>
              This section lists your recent work. Open an analysis to see it
              here.
            </p>
          </div>
        </section>

        <section className='dashboard-section'>
          <div className='dashboard-section-header'>
            <h3>
              Choose from the Prebuilt{' '}
              <DefinedTerm term='analysisQuestion'>Analysis Questions</DefinedTerm>
            </h3>
            <button
              className='btn-view-more'
              onClick={() => setSearchOpen(true)}
            >
              <svg className='btn-icon' viewBox='0 0 18 18' fill='currentColor' width='18' height='18' aria-hidden='true'>
                <rect x='1' y='1' width='7' height='7' rx='1.5' />
                <rect x='10' y='1' width='7' height='7' rx='1.5' />
                <rect x='1' y='10' width='7' height='7' rx='1.5' />
                <rect x='10' y='10' width='7' height='7' rx='1.5' />
              </svg>
              View more Available Analysis Questions
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
      </div>

      {searchOpen && (
        <SearchQuestionsModal
          onClose={() => setSearchOpen(false)}
          onSelect={(query) => {
            setSearchOpen(false);
            navigate(`/q/${query.id}`);
          }}
        />
      )}
    </div>
  );
}
