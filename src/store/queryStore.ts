import { create } from 'zustand';
import type { AnalysisQuestion, EntityBlock, SpatialRelationship } from '../types/query';
import type { StepProgress, PipelineResult, PipelineError } from '../engine/executor';

function defaultEntityBlock(type: EntityBlock['type']): EntityBlock {
  return { type };
}

function defaultQuestion(): AnalysisQuestion {
  return {
    blockA: defaultEntityBlock('samples'),
    relationship: { type: 'near', hops: 1 },
    blockC: defaultEntityBlock('facilities'),
  };
}

interface QueryStore {
  activeQueryId: string | null;
  question: AnalysisQuestion;
  stepProgress: StepProgress[];
  pipelineResult: PipelineResult | null;
  isRunning: boolean;
  isEditModalOpen: boolean;
  questionSnapshot: AnalysisQuestion | null;
  pendingAutoRun: boolean;
  lastApplyError: PipelineError | null;

  loadQuestion: (id: string, question: AnalysisQuestion) => void;
  clearPendingAutoRun: () => void;

  setBlockA: (block: EntityBlock) => void;
  setBlockC: (block: EntityBlock) => void;
  setRelationship: (rel: SpatialRelationship) => void;
  setQuestion: (q: AnalysisQuestion) => void;
  resetQuestion: () => void;

  openEditModal: () => void;
  closeEditModal: () => void;
  discardEditModal: () => void;
  commitSnapshot: () => void;
  setLastApplyError: (err: PipelineError | null) => void;
  clearLastApplyError: () => void;

  setIsRunning: (running: boolean) => void;
  addStepProgress: (progress: StepProgress) => void;
  clearProgress: () => void;
  setPipelineResult: (result: PipelineResult | null) => void;
}

export const useQueryStore = create<QueryStore>((set) => ({
  activeQueryId: null,
  question: defaultQuestion(),
  stepProgress: [],
  pipelineResult: null,
  isRunning: false,
  isEditModalOpen: false,
  questionSnapshot: null,
  pendingAutoRun: false,
  lastApplyError: null,

  loadQuestion: (id, question) =>
    set({
      activeQueryId: id,
      question,
      stepProgress: [],
      pipelineResult: null,
      pendingAutoRun: true,
      lastApplyError: null,
    }),
  clearPendingAutoRun: () => set({ pendingAutoRun: false }),

  setBlockA: (block) => set((s) => ({ question: { ...s.question, blockA: block } })),
  setBlockC: (block) => set((s) => ({ question: { ...s.question, blockC: block } })),
  setRelationship: (rel) => set((s) => ({ question: { ...s.question, relationship: rel } })),
  setQuestion: (question) => set({ question }),
  resetQuestion: () => set({ question: defaultQuestion() }),

  openEditModal: () =>
    set((s) => ({
      isEditModalOpen: true,
      questionSnapshot: JSON.parse(JSON.stringify(s.question)),
      stepProgress: [],
    })),
  closeEditModal: () =>
    set({ isEditModalOpen: false, questionSnapshot: null, lastApplyError: null }),
  discardEditModal: () =>
    set((s) => ({
      isEditModalOpen: false,
      question: s.questionSnapshot || s.question,
      questionSnapshot: null,
      lastApplyError: null,
    })),
  commitSnapshot: () =>
    set((s) => ({ questionSnapshot: JSON.parse(JSON.stringify(s.question)) })),
  setLastApplyError: (lastApplyError) => set({ lastApplyError }),
  clearLastApplyError: () => set({ lastApplyError: null }),

  setIsRunning: (isRunning) => set({ isRunning }),
  addStepProgress: (progress) =>
    set((s) => {
      const updated = [...s.stepProgress];
      updated[progress.stepIndex] = progress;
      return { stepProgress: updated };
    }),
  clearProgress: () => set({ stepProgress: [] }),
  setPipelineResult: (pipelineResult) => set({ pipelineResult }),
}));
