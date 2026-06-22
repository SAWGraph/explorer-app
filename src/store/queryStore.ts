import { create } from 'zustand';
import type { AnalysisQuestion, EntityBlock, SpatialRelationship } from '../types/query';
import type { StepProgress, PipelineResult, PipelineError } from '../engine/executor';
import { deepClone } from '../utils/clone';

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
  activeQueryName: string | null;
  question: AnalysisQuestion;
  baselineQuestion: AnalysisQuestion;
  stepProgress: StepProgress[];
  pipelineResult: PipelineResult | null;
  isRunning: boolean;
  isEditModalOpen: boolean;
  questionSnapshot: AnalysisQuestion | null;
  pendingAutoRun: boolean;
  lastApplyError: PipelineError | null;

  loadQuestion: (
    id: string,
    question: AnalysisQuestion,
    name?: string | null,
    options?: { autoRun?: boolean },
  ) => void;
  setActiveQueryId: (id: string | null) => void;
  setActiveQueryName: (name: string | null) => void;
  markBaseline: () => void;
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
  activeQueryName: null,
  question: defaultQuestion(),
  baselineQuestion: defaultQuestion(),
  stepProgress: [],
  pipelineResult: null,
  isRunning: false,
  isEditModalOpen: false,
  questionSnapshot: null,
  pendingAutoRun: false,
  lastApplyError: null,

  loadQuestion: (id, question, name = null, options = {}) =>
    set({
      activeQueryId: id,
      activeQueryName: name,
      question,
      baselineQuestion: deepClone(question),
      stepProgress: [],
      pipelineResult: null,
      pendingAutoRun: options.autoRun ?? true,
      lastApplyError: null,
    }),
  setActiveQueryId: (activeQueryId) => set({ activeQueryId }),
  setActiveQueryName: (activeQueryName) => set({ activeQueryName }),
  markBaseline: () =>
    set((s) => ({ baselineQuestion: deepClone(s.question) })),
  clearPendingAutoRun: () => set({ pendingAutoRun: false }),

  setBlockA: (block) => set((s) => ({ question: { ...s.question, blockA: block } })),
  setBlockC: (block) => set((s) => ({ question: { ...s.question, blockC: block } })),
  setRelationship: (rel) => set((s) => ({ question: { ...s.question, relationship: rel } })),
  setQuestion: (question) => set({ question }),
  resetQuestion: () => set({ question: defaultQuestion() }),

  openEditModal: () =>
    set((s) => ({
      isEditModalOpen: true,
      questionSnapshot: deepClone(s.question),
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
    set((s) => ({ questionSnapshot: deepClone(s.question) })),
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
