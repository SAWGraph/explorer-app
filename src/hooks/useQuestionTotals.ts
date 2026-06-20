import type { AnalysisQuestion } from '../types/query';
import type { QuestionTotals } from '../utils/questionGenerator';
import {
  useIndustries,
  useSubstances,
  useMaterialTypes,
  useCounties,
} from './useDiscoveryQueries';

// Reads the universe of available counties/industries/substances/materials so
// generateQuestion can collapse "all selected" into "all counties in Maine" etc.
export function useQuestionTotals(question: AnalysisQuestion): QuestionTotals {
  const stateCode = question.blockA.region?.stateCode;
  const counties = useCounties(stateCode);
  const industries = useIndustries();
  const substances = useSubstances();
  const materialTypes = useMaterialTypes();

  // Top-level NAICS roots = 2-digit codes (sectors).
  const industryRoots = industries.data?.filter((i) => i.code.length === 2).length;

  return {
    counties: counties.data?.length,
    industries: industryRoots,
    substances: substances.data?.length,
    materialTypes: materialTypes.data?.length,
  };
}
