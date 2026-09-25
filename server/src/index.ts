import cors from 'cors';
import express from 'express';
import { runMigrations } from './db.js';
import { publishRouter } from './routes/publish.js';
import { resultsRouter } from './routes/results.js';
import { sweepExpired } from './resultCache.js';

const app = express();

app.use(
  cors({
    origin: process.env.FRONTEND_ORIGIN ?? true,
  }),
);
// Result uploads carry megabytes and are parsed by their own route-scoped
// parser (routes/results.ts, routes/publish.ts). A global parser would reject
// them at 64kb before the route ever ran, so it has to skip those two paths —
// everything else keeps the small default.
const smallJson = express.json({ limit: '64kb' });
const isResultUpload = (method: string, path: string) =>
  method === 'PUT' && (/\/result$/.test(path) || path.startsWith('/api/results/'));

app.use((req, res, next) =>
  isResultUpload(req.method, req.path) ? next() : smallJson(req, res, next),
);

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.use('/api/publish', publishRouter);
app.use('/api/results', resultsRouter);

const port = Number(process.env.PORT ?? 3001);

runMigrations()
  .then(async () => {
    // Cheap enough to do inline at boot; there is no scheduler in this service.
    const swept = await sweepExpired().catch((err) => {
      console.error('cache sweep failed', err);
      return 0;
    });
    if (swept > 0) console.log(`swept ${swept} expired cached results`);

    app.listen(port, () => {
      console.log(`sawgraph-api listening on :${port}`);
    });
  })
  .catch((err) => {
    console.error('migration failed', err);
    process.exit(1);
  });
