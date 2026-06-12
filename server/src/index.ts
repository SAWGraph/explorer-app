import cors from 'cors';
import express from 'express';
import { runMigrations } from './db.js';
import { publishRouter } from './routes/publish.js';

const app = express();

app.use(
  cors({
    origin: process.env.FRONTEND_ORIGIN ?? true,
  }),
);
app.use(express.json({ limit: '64kb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.use('/api/publish', publishRouter);

const port = Number(process.env.PORT ?? 3001);

runMigrations()
  .then(() => {
    app.listen(port, () => {
      console.log(`sawgraph-api listening on :${port}`);
    });
  })
  .catch((err) => {
    console.error('migration failed', err);
    process.exit(1);
  });
