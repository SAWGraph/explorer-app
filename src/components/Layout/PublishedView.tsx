import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQueryStore } from '../../store/queryStore';
import { fetchPublishedResult } from '../../api/resultCacheClient';
import { AnalysisQuestionBar } from './AnalysisQuestionBar';
import { MainContent } from './MainContent';
import { EditModal } from '../QueryEditor/EditModal';
import type { AnalysisQuestion } from '../../types/query';

interface PublishedWorkflow {
  id: string;
  author: string;
  title: string;
  description: string | null;
  tags: string[];
  question: AnalysisQuestion;
  created_at: string;
  view_count: number;
  result_key?: string | null;
}

function getApiBase(): string {
  const base = import.meta.env.VITE_API_BASE_URL;
  if (!base) throw new Error('VITE_API_BASE_URL is not set');
  return base.replace(/\/$/, '');
}

export function PublishedView() {
  const { publishId } = useParams<{ publishId: string }>();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<PublishedWorkflow | null>(null);
  const activeQueryName = useQueryStore((s) => s.activeQueryName);

  useEffect(() => {
    if (!publishId) {
      navigate('/', { replace: true });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${getApiBase()}/api/publish/${publishId}`);
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? `Failed to load (${res.status})`);
        }
        const data = (await res.json()) as PublishedWorkflow;
        if (cancelled) return;

        // A published result the publisher already computed. Without this every
        // visitor re-ran the whole pipeline in their own browser (26-218s, and
        // sometimes failing) to rebuild an answer that never changes.
        const cached = data.result_key ? await fetchPublishedResult(data.id) : null;
        if (cancelled) return;

        useQueryStore
          .getState()
          .loadQuestion(`published:${data.id}`, data.question, data.title, {
            autoRun: !cached,
          });
        if (cached) {
          const store = useQueryStore.getState();
          store.setPipelineResult(cached.result);
          store.setResultProvenance({ computedAt: cached.computedAt, partial: cached.partial });
        }
        setMeta(data);
        setStatus('ready');
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load workflow');
        setStatus('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [publishId, navigate]);

  if (status === 'loading') {
    return (
      <div className="published-state">
        <p>Loading published workflow…</p>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="published-state">
        <h2>Workflow not found</h2>
        <p>{error}</p>
        <Link to="/" className="btn-secondary">
          Back to dashboard
        </Link>
      </div>
    );
  }

  return (
    <>
      {meta && (
        <div className="published-banner">
          <div>
            <strong>{activeQueryName ?? meta.title}</strong>
            <span className="published-banner-author"> · shared by {meta.author}</span>
          </div>
          {meta.tags.length > 0 && (
            <div className="published-banner-tags">
              {meta.tags.map((t) => (
                <span key={t} className="tag-chip">
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
      <AnalysisQuestionBar />
      <MainContent />
      <EditModal />
    </>
  );
}
