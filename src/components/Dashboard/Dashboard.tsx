import { useNavigate } from 'react-router-dom';
import { PREBUILT_QUERIES } from '../../constants/prebuiltQueries';
import { PrebuiltQueryCard } from './PrebuiltQueryCard';

export function Dashboard() {
  const navigate = useNavigate();

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
            <h3>Choose from the Prebuilt Analysis Questions</h3>
            <button
              className='btn-view-more'
              onClick={() => navigate('/q/new')}
            >
              <span className='btn-icon'>&#x2b1c;&#x2b1c;</span>
              View more Available Analysis Questions
            </button>
          </div>

          <div className='query-cards-list'>
            {PREBUILT_QUERIES.map((query) => (
              <PrebuiltQueryCard
                key={query.id}
                query={query}
                onClick={() => navigate(`/q/${query.id}`)}
              />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
