import type { AnalysisQuestion } from '../types/query';

export function blankAnalysisQuestion(): AnalysisQuestion {
  return {
    blockA: { type: 'samples', region: { stateCode: '23' } },
    relationship: { type: 'near', hops: 1 },
    blockC: { type: 'facilities' },
  };
}
