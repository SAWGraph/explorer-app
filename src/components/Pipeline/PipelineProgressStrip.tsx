import { useEffect, useState } from 'react';
import { useQueryStore } from '../../store/queryStore';

const MESSAGES = [
  'Please wait while we prepare the data for you…',
  'Querying SPARQL endpoints and building the spatial index…',
  'Searching for spatial relationships across the knowledge graph…',
  'Almost there, loading the results…',
];

export function PipelineProgressStrip() {
  const isRunning = useQueryStore((s) => s.isRunning);
  const isEditModalOpen = useQueryStore((s) => s.isEditModalOpen);
  const pipelineResult = useQueryStore((s) => s.pipelineResult);
  const [msgIndex, setMsgIndex] = useState(0);

  useEffect(() => {
    if (!isRunning) return;
    const id = setInterval(
      () => setMsgIndex((i) => (i + 1) % MESSAGES.length),
      4000,
    );
    return () => clearInterval(id);
  }, [isRunning]);

  const isError =
    pipelineResult?.status === 'error' || pipelineResult?.status === 'empty';

  // While running inside the Edit modal, the modal itself shows the timeline — hide strip
  if (isRunning && isEditModalOpen) return null;

  if (!isRunning && !isError) return null;

  let message: string;
  if (isRunning) {
    message = MESSAGES[msgIndex];
  } else if (pipelineResult?.status === 'empty') {
    message = 'No results found for this query. Try adjusting the filters.';
  } else {
    message = 'Something went wrong. You can edit the question and try again.';
  }

  // Running outside modal (initial load from dashboard) → full-screen blocking overlay
  const fullscreen = isRunning && !isEditModalOpen;

  return (
    <div
      className={`pipeline-strip${isError ? ' pipeline-strip--error' : ''}${fullscreen ? ' pipeline-strip--fullscreen' : ''}`}
    >
      <div className='pipeline-strip-card'>
        {isRunning ? (
          <svg
            className='pipeline-strip-spinner'
            viewBox='0 0 24 24'
            fill='none'
            stroke='currentColor'
            strokeWidth='2.5'
            strokeLinecap='round'
          >
            <circle cx='12' cy='12' r='9' strokeOpacity='0.25' />
            <path d='M12 3a9 9 0 0 1 9 9' />
          </svg>
        ) : (
          <svg
            className='pipeline-strip-icon'
            viewBox='0 0 24 24'
            fill='none'
            stroke='currentColor'
            strokeWidth='2'
            strokeLinecap='round'
            strokeLinejoin='round'
          >
            <path d='M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z' />
            <line x1='12' y1='9' x2='12' y2='13' />
            <line x1='12' y1='17' x2='12.01' y2='17' />
          </svg>
        )}
        <span className='pipeline-strip-label'>{message}</span>
      </div>
    </div>
  );
}
