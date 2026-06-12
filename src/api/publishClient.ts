import type { AnalysisQuestion } from '../types/query';

export interface PublishWorkflowInput {
  author: string;
  title: string;
  description: string;
  tags: string[];
  question: AnalysisQuestion;
}

export interface PublishWorkflowResponse {
  id: string;
  url: string;
}

function getApiBase(): string {
  const base = import.meta.env.VITE_API_BASE_URL;
  if (!base) {
    throw new Error(
      'VITE_API_BASE_URL is not set. Add it to .env.local (see .env.example).',
    );
  }
  return base.replace(/\/$/, '');
}

export async function publishWorkflow(
  input: PublishWorkflowInput,
): Promise<PublishWorkflowResponse> {
  const res = await fetch(`${getApiBase()}/api/publish`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    let message = `Publish failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }

  return (await res.json()) as PublishWorkflowResponse;
}
