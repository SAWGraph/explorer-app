import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  savedQuestionsRepo,
  type CreateSavedQuestionInput,
  type UpdateSavedQuestionPatch,
} from '../storage/savedQuestionsStore';
import type { SavedQuestion } from '../types/savedQuestion';

const KEY = ['savedQuestions'] as const;

export function useSavedQuestionsList() {
  return useQuery<SavedQuestion[]>({
    queryKey: KEY,
    queryFn: () => savedQuestionsRepo.list(),
    staleTime: Infinity,
  });
}

export function useCreateSavedQuestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSavedQuestionInput) =>
      Promise.resolve(savedQuestionsRepo.create(input)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
    },
  });
}

export function useUpdateSavedQuestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateSavedQuestionPatch }) =>
      Promise.resolve(savedQuestionsRepo.update(id, patch)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
    },
  });
}

export function useDeleteSavedQuestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => {
      savedQuestionsRepo.remove(id);
      return Promise.resolve();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
    },
  });
}
