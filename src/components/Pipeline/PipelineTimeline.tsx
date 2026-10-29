import type { StepProgress } from '../../../engine/executor';

interface PipelineTimelineProps {
  steps: StepProgress[];
  isRunning: boolean;
}

export function PipelineTimeline({ steps, isRunning }: PipelineTimelineProps) {
  if (steps.length === 0 && !isRunning) return null;

  return (
    <div className="pipeline-timeline">
      <h3>Pipeline Progress</h3>
      <div className="timeline-steps">
        {steps.filter(Boolean).map((step, i, arr) => {
          const isLast = i === arr.length - 1;
          return (
            <div key={i} className={`timeline-step timeline-step--${step.status}`}>
              <div className="timeline-indicator">
                <div className={`timeline-dot timeline-dot--${step.status}`} />
                {!isLast && (
                  <div
                    className={`timeline-line${step.status === 'done' ? ' timeline-line--done' : ''}`}
                  />
                )}
              </div>
              <div
                className={`timeline-content${step.status === 'running' ? ' timeline-content--running' : ''}`}
              >
                <span className="timeline-desc">
                  Step {i + 1}/{step.totalSteps}: {step.description}
                </span>
                {step.resultCount !== undefined && step.status === 'done' && (
                  <span className="timeline-count">({step.resultCount} results)</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
