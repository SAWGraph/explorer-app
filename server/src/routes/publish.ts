import { randomBytes } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import { pool } from '../db.js';

export const publishRouter = Router();

interface PublishBody {
  author?: unknown;
  title?: unknown;
  description?: unknown;
  tags?: unknown;
  question?: unknown;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

function genId(): string {
  return `p_${randomBytes(4).toString('hex')}`;
}

function buildShareUrl(req: Request, id: string): string {
  const origin = process.env.FRONTEND_ORIGIN?.replace(/\/$/, '');
  if (origin) return `${origin}/p/${id}`;
  return `${req.protocol}://${req.get('host')}/p/${id}`;
}

publishRouter.post('/', async (req: Request, res: Response) => {
  const body = req.body as PublishBody;

  const author = typeof body.author === 'string' ? body.author.trim() : '';
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const description =
    typeof body.description === 'string' ? body.description.trim() : '';
  const tags = isStringArray(body.tags) ? body.tags.slice(0, 10) : [];
  const question = body.question;

  if (!author) return res.status(400).json({ error: 'author is required' });
  if (!title) return res.status(400).json({ error: 'title is required' });
  if (!question || typeof question !== 'object') {
    return res.status(400).json({ error: 'question is required' });
  }
  if (title.length > 200) {
    return res.status(400).json({ error: 'title too long' });
  }

  const id = genId();
  try {
    await pool.query(
      `INSERT INTO published_workflows
        (id, author, title, description, tags, question)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, author, title, description || null, tags, question],
    );
  } catch (err) {
    console.error('publish insert failed', err);
    return res.status(500).json({ error: 'failed to publish' });
  }

  return res.status(201).json({ id, url: buildShareUrl(req, id) });
});

publishRouter.get('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `UPDATE published_workflows
         SET view_count = view_count + 1
       WHERE id = $1
       RETURNING id, author, title, description, tags, question, created_at, view_count`,
      [id],
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'not found' });
    }
    return res.json(result.rows[0]);
  } catch (err) {
    console.error('publish lookup failed', err);
    return res.status(500).json({ error: 'failed to fetch' });
  }
});
