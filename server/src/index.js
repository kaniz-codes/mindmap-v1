import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { publicRouter, router as account } from './routes/account.js';
import { router as classes } from './routes/classes.js';
import { router as tasks } from './routes/tasks.js';
import { router as goals } from './routes/goals.js';
import { activities, reminders } from './routes/activities.js';
import { router as views } from './routes/views.js';
import { aiEnabled } from './lib/ai.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (req, res) => res.json({ ok: true, ai: aiEnabled() }));
app.use('/api', publicRouter);
app.use('/api/classes', classes);
app.use('/api/tasks', tasks);
app.use('/api/goals', goals);
app.use('/api/activities', activities);
app.use('/api/reminders', reminders);
app.use('/api', account);
app.use('/api', views);

// Serve the built client in production.
const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'client', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use((req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, req, res, next) => {
  if (!err.status || err.status >= 500) console.error(err);
  res.status(err.status || 500).json({ error: err.status ? err.message : 'Something went wrong on our side', ...(err.clash ? { clash: err.clash } : {}) });
});

const port = Number(process.env.PORT) || 4000;
app.listen(port, () => console.log(`MIND MAP API on http://localhost:${port} (AI ${aiEnabled() ? 'on' : 'off, using rules'})`));
