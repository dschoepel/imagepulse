import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import webhookRouter from './routes/webhook.js';
import eventsRouter from './routes/events.js';
import settingsRouter from './routes/settings.js';
import { initDb } from './db/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';

initDb();

const app = express();

app.use(cors());
app.use(express.json());

// API routes
app.use('/api/webhook', webhookRouter);
app.use('/api/events', eventsRouter);
app.use('/api/settings', settingsRouter);

// Serve frontend static files in production
if (isProd) {
  const publicDir = path.join(__dirname, '..', 'public');
  app.use(express.static(publicDir));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`ImagePulse listening on port ${PORT}`);
});

export default app;
