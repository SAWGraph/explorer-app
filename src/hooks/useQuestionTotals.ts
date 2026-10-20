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
  // Each block's region is described against its own state's county list.
  const stateA = question.blockA.region?.stateCode;
  const stateC = question.blockC.region?.stateCode;
  const countiesA = useCounties(stateA);
  const countiesC = useCounties(stateC);
  const industries = useIndustries();
  const substances = useSubstances();
  const materialTypes = useMaterialTypes();

  // Top-level NAICS roots = 2-digit codes (sectors).
  const industryRoots = industries.data?.filter((i) => i.code.length === 2).length;

  const counties: Record<string, number> = {};
  if (stateA && countiesA.data) counties[stateA] = countiesA.data.length;
  if (stateC && countiesC.data) counties[stateC] = countiesC.data.length;

  return {
    counties,
    industries: industryRoots,
    substances: substances.data?.length,
    materialTypes: materialTypes.data?.length,
  };
}
