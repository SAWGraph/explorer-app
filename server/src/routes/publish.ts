import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import { pool } from '../db.js';

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function tokensMatch(provided: string, storedHash: string): boolean {
  const providedHash = hashToken(provided);
  const a = Buffer.from(providedHash, 'hex');
  const b = Buffer.from(storedHash, 'hex');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

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
  const editToken = randomBytes(32).toString('hex');
  try {
    await pool.query(
      `INSERT INTO published_workflows
        (id, author, title, description, tags, question, edit_token_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, author, title, description || null, tags, question, hashToken(editToken)],
    );
  } catch (err) {
    console.error('publish insert failed', err);
    return res.status(500).json({ error: 'failed to publish' });
  }

  return res.status(201).json({ id, url: buildShareUrl(req, id), editToken });
});

publishRouter.get('/', async (req: Request, res: Response) => {
  const requested = Number(req.query.limit ?? 50);
  const limit = Math.min(Math.max(Number.isFinite(requested) ? requested : 50, 1), 100);
  try {
    const result = await pool.query(
      `SELECT id, author, title, description, tags, created_at, view_count
         FROM published_workflows
         ORDER BY view_count DESC, created_at DESC
         LIMIT $1`,
      [limit],
    );
    return res.json(result.rows);
  } catch (err) {
    console.error('publish list failed', err);
    return res.status(500).json({ error: 'failed to list' });
  }
});

publishRouter.patch('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const body = req.body as { title?: unknown; editToken?: unknown };
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const editToken = typeof body.editToken === 'string' ? body.editToken : '';

  if (!title) return res.status(400).json({ error: 'title is required' });
  if (title.length > 200) return res.status(400).json({ error: 'title too long' });
  if (!editToken) return res.status(401).json({ error: 'editToken is required' });

  try {
    const existing = await pool.query(
      `SELECT edit_token_hash FROM published_workflows WHERE id = $1`,
      [id],
    );
    if (existing.rowCount === 0) {
      return res.status(404).json({ error: 'not found' });
    }
    const storedHash: string | null = existing.rows[0].edit_token_hash;
    if (!storedHash || !tokensMatch(editToken, storedHash)) {
      return res.status(403).json({ error: 'invalid editToken' });
    }
    const result = await pool.query(
      `UPDATE published_workflows SET title = $1 WHERE id = $2 RETURNING id, title`,
      [title, id],
    );
    return res.json(result.rows[0]);
  } catch (err) {
    console.error('publish rename failed', err);
    return res.status(500).json({ error: 'failed to rename' });
  }
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
