import Anthropic from '@anthropic-ai/sdk';
import type { AnalysisQuestion } from '../types/query';

// ponytail: browser-side key = demo only. Move to a serverless proxy before shipping.
const client = new Anthropic({
  apiKey: import.meta.env.VITE_ANTHROPIC_KEY,
  dangerouslyAllowBrowser: true,
});

// Structure-only mirror of AnalysisQuestion. Detailed filters (substance/NAICS/
// county URIs) are intentionally omitted — Claude doesn't know the endpoint
// vocab, so we let it fill structure and leave filters blank.
const ENTITY = {
  type: 'object',
  required: ['type'],
  properties: {
    type: { enum: ['samples', 'facilities', 'waterBodies', 'wells'] },
    region: {
      type: 'object',
      properties: {
        stateCode: { type: 'string', description: '2-digit state FIPS code, e.g. "23" for Maine' },
      },
    },
  },
} as const;

const QUESTION_SCHEMA = {
  type: 'object',
  required: ['blockA', 'relationship', 'blockC'],
  properties: {
    blockA: ENTITY,
    relationship: {
      type: 'object',
      required: ['type'],
      properties: { type: { enum: ['near', 'downstream', 'upstream', 'within'] } },
    },
    blockC: ENTITY,
  },
} as const;

const SYSTEM = `You convert a user's plain-English question into a SAWGraph AnalysisQuestion.
The model has three parts: a target entity (blockA), a spatial/hydrological relationship, and an anchor entity (blockC).
Phrasing: "A <relationship> B" → blockA = A, blockC = B.
Relationships: near (proximity), downstream / upstream (water flow), within (containment).
region.stateCode is a 2-digit US state FIPS code (Maine=23, California=06, etc.).
Only set fields you are confident about; omit anything uncertain.`;

export async function nlToQuestion(text: string): Promise<AnalysisQuestion> {
  const res = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 1024,
    system: SYSTEM,
    tools: [
      {
        name: 'build_question',
        description: 'Emit the structured analysis question',
        input_schema: QUESTION_SCHEMA as unknown as Anthropic.Tool.InputSchema,
      },
    ],
    tool_choice: { type: 'tool', name: 'build_question' },
    messages: [{ role: 'user', content: text }],
  });

  const tool = res.content.find((b) => b.type === 'tool_use');
  if (!tool || tool.type !== 'tool_use') {
    throw new Error('Could not turn that into a question — try rephrasing.');
  }
  return tool.input as AnalysisQuestion;
}
