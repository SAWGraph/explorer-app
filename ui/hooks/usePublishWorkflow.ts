import { useMutation, useQuery } from '@tanstack/react-query';
import {
  listPublishedWorkflows,
  publishWorkflow,
  renamePublishedWorkflow,
} from '../api/publishClient';
import type {
  PublishedListItem,
  PublishWorkflowInput,
  PublishWorkflowResponse,
} from '../api/publishClient';
import { publishEditTokens } from '../storage/publishEditTokens';

export function usePublishWorkflow() {
  return useMutation<PublishWorkflowResponse, Error, PublishWorkflowInput>({
    mutationFn: publishWorkflow,
    onSuccess: (data) => {
      publishEditTokens.set(data.id, data.editToken);
    },
  });
}

export function usePublishedWorkflowsList(limit?: number) {
  return useQuery<PublishedListItem[]>({
    queryKey: ['publishedWorkflows', limit ?? 'all'],
    queryFn: () => listPublishedWorkflows(limit),
    staleTime: 60_000,
  });
}

export function useRenamePublishedWorkflow() {
  return useMutation<
    { id: string; title: string },
    Error,
    { id: string; title: string; editToken: string }
  >({
    mutationFn: ({ id, title, editToken }) =>
      renamePublishedWorkflow(id, title, editToken),
  });
}
