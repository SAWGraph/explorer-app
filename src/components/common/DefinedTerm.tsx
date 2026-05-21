import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export type GlossaryTerm = 'analysisQuestion' | 'feature' | 'observation';

interface GlossaryEntry {
  label: string;
  definition: string;
}

const GLOSSARY: Record<GlossaryTerm, GlossaryEntry> = {
  analysisQuestion: {
    label: 'Analysis Question',
    definition:
      'A ready-made query you can run on the SAWGraph knowledge graph. It pairs two things you care about — samples, facilities, water bodies, or wells — with a spatial or hydrological relationship (near, upstream, downstream), then shows them together on the map.',
  },
  feature: {
    label: 'Feature',
    definition:
      "A real-world thing on the map with a fixed location — a facility, a water body, or a well. It's there whether or not anyone has measured it.",
  },
  observation: {
    label: 'Observation',
    definition:
      'A measurement taken at a specific place and time, like a PFAS sample result. It tells you what was found there, not just what is there.',
  },
};

const TOOLTIP_GAP = 10;

interface DefinedTermProps {
  term: GlossaryTerm;
  children: React.ReactNode;
}

export function DefinedTerm({ term, children }: DefinedTermProps) {
  const tooltipId = useId();
  const triggerRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const entry = GLOSSARY[term];

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const updatePosition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      setCoords({
        top: rect.top - TOOLTIP_GAP,
        left: rect.left + rect.width / 2,
      });
    };
    updatePosition();
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [open]);

  useEffect(() => {
    if (!open) setCoords(null);
  }, [open]);

  const show = () => setOpen(true);
  const hide = () => setOpen(false);

  return (
    <>
      <span
        ref={triggerRef}
        className='defined-term'
        tabIndex={0}
        aria-describedby={open ? tooltipId : undefined}
        onPointerEnter={show}
        onPointerLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        {children}
      </span>
      {open && coords &&
        createPortal(
          <span
            id={tooltipId}
            role='tooltip'
            className='defined-term-tooltip'
            style={{ top: coords.top, left: coords.left }}
          >
            <strong className='defined-term-tooltip-label'>{entry.label}</strong>
            <span className='defined-term-tooltip-body'>{entry.definition}</span>
          </span>,
          document.body
        )}
    </>
  );
}
