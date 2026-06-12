import { useMutation } from '@tanstack/react-query';
import { publishWorkflow } from '../api/publishClient';
import type {
  PublishWorkflowInput,
  PublishWorkflowResponse,
} from '../api/publishClient';

export function usePublishWorkflow() {
  return useMutation<PublishWorkflowResponse, Error, PublishWorkflowInput>({
    mutationFn: publishWorkflow,
  });
}
