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
  editToken: string;
}

export interface PublishedListItem {
  id: string;
  author: string;
  title: string;
  description: string | null;
  tags: string[];
  created_at: string;
  view_count: number;
}

export async function listPublishedWorkflows(
  limit?: number,
): Promise<PublishedListItem[]> {
  const url = new URL(`${getApiBase()}/api/publish`);
  if (limit) url.searchParams.set('limit', String(limit));
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`List failed (${res.status})`);
  return (await res.json()) as PublishedListItem[];
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

export async function renamePublishedWorkflow(
  id: string,
  title: string,
  editToken: string,
): Promise<{ id: string; title: string }> {
  const res = await fetch(`${getApiBase()}/api/publish/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title, editToken }),
  });
  if (!res.ok) {
    let message = `Rename failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  return (await res.json()) as { id: string; title: string };
}
