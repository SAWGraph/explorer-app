import { useId } from 'react';

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

interface DefinedTermProps {
  term: GlossaryTerm;
  children: React.ReactNode;
}

export function DefinedTerm({ term, children }: DefinedTermProps) {
  const tooltipId = useId();
  const entry = GLOSSARY[term];

  return (
    <span className='defined-term' tabIndex={0} aria-describedby={tooltipId}>
      {children}
      <span className='defined-term-tooltip' role='tooltip' id={tooltipId}>
        <strong className='defined-term-tooltip-label'>{entry.label}</strong>
        <span className='defined-term-tooltip-body'>{entry.definition}</span>
      </span>
    </span>
  );
}
