import { useEffect, useState } from 'react';
import { useQueryStore } from '../../store/queryStore';
import { useQueryPipeline } from '../../hooks/useQueryPipeline';
import { nlToQuestion } from '../../engine/nlToQuestion';

export function NLQueryBar() {
  const setQuestion = useQueryStore((s) => s.setQuestion);
  const { runPipeline, isRunning } = useQueryPipeline();
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Run after setQuestion has landed in the store — runPipeline closes over
  // the store's question, which is stale in the same tick as setQuestion.
  const [pendingRun, setPendingRun] = useState(false);

  useEffect(() => {
    if (!pendingRun) return;
    setPendingRun(false);
    runPipeline();
  }, [pendingRun, runPipeline]);

  async function ask() {
    if (!text.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      setQuestion(await nlToQuestion(text));
      setPendingRun(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="nl-query-bar">
      <input
        type="text"
        value={text}
        placeholder="Ask in plain English, e.g. samples downstream of facilities in Maine"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && ask()}
        disabled={loading || isRunning}
      />
      <button onClick={ask} disabled={loading || isRunning || !text.trim()}>
        {loading ? 'Thinking…' : 'Ask'}
      </button>
      {error && <span className="nl-query-error">{error}</span>}
    </div>
  );
}
