import type { PipelineResult } from '../../../engine/executor';

interface PipelineErrorProps {
  result: PipelineResult | null;
}

export function PipelineError({ result }: PipelineErrorProps) {
  if (!result) return null;

  if (result.status === 'empty') {
    return (
      <div className="pipeline-message pipeline-empty">
        <strong>No results found.</strong> {result.message}
      </div>
    );
  }

  if (result.status === 'error') {
    return (
      <div className="pipeline-message pipeline-error">
        <strong>Error:</strong> {result.message}
        {result.error && <pre>{result.error.message}</pre>}
      </div>
    );
  }

  return null;
}
