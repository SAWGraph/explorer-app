import { useEffect, useState } from 'react';
import { useQueryStore } from '../../store/queryStore';
import type { SentQuery } from '../../engine/executor';

// Shows the queries behind whatever is on the map: prebuilt, edited or custom.
// They are the exact requests the executor sent, so they always match the map.
export function SparqlChip() {
  const isRunning = useQueryStore((s) => s.isRunning);
  const queries = useQueryStore((s) => s.pipelineResult?.queries);
  const [open, setOpen] = useState(false);

  if (isRunning || !queries?.length) return null;

  return (
    <>
      <button type='button' className='sparql-chip' onClick={() => setOpen(true)}>
        <svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2.5' aria-hidden='true'>
          <path d='m16 18 6-6-6-6' />
          <path d='m8 6-6 6 6 6' />
        </svg>
        See Full SPARQL
      </button>
      {open && <SparqlModal queries={queries} onClose={() => setOpen(false)} />}
    </>
  );
}

function SparqlModal({ queries, onClose }: { queries: SentQuery[]; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className='modal-overlay' onClick={onClose}>
      <div
        className='sparql-modal'
        onClick={(e) => e.stopPropagation()}
        role='dialog'
        aria-modal='true'
        aria-label='Full SPARQL'
      >
        <div className='sparql-modal-header'>
          <h2>Full SPARQL</h2>
          <button type='button' className='sparql-modal-close' onClick={onClose} aria-label='Close'>
            ×
          </button>
        </div>
        <div className='sparql-modal-body'>
          {queries.map((q, i) => (
            <SparqlBlock key={i} sent={q} />
          ))}
        </div>
      </div>
    </div>
  );
}

function SparqlBlock({ sent }: { sent: SentQuery }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(sent.query.trim());
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <section className='sparql-block'>
      <div className='sparql-block-header'>
        <span>
          <strong>Step {sent.step + 1}</strong> · {sent.description} · {sent.endpoint}
          {sent.scope && ` · ${sent.scope}`}
        </span>
        {sent.error && <span className='sparql-block-failed' title={sent.error}>Failed</span>}
        <button
          type='button'
          className='sparql-copy'
          onClick={() => void copy()}
          aria-label='Copy SPARQL'
          title='Copy SPARQL'
        >
          {copied ? (
            'Copied'
          ) : (
            <svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'>
              <rect x='9' y='9' width='13' height='13' rx='2' />
              <path d='M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1' />
            </svg>
          )}
        </button>
      </div>
      {sent.error && <p className='sparql-block-error'>{sent.error}</p>}
      <pre>
        <code>{sent.query.trim()}</code>
      </pre>
    </section>
  );
}
