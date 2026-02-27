import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import webhookRouter from './routes/webhook.js';
import eventsRouter from './routes/events.js';
import settingsRouter from './routes/settings.js';
import versionRouter from './routes/version.js';
import { initDb, getSetting, pruneOldEvents, seedSettingsFromEnv } from './db/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3579;
initDb();
seedSettingsFromEnv();

// Run retention prune on startup and every 24 hours
function runRetention() {
  const days = parseInt(getSetting('retention_days') || '0', 10);
  if (days > 0) {
    const deleted = pruneOldEvents(days);
    console.log(`Retention: pruned ${deleted} event(s) older than ${days} day(s)`);
  } else {
    console.log('Retention: disabled (retention_days = 0)');
  }
}

runRetention();
setInterval(runRetention, 24 * 60 * 60 * 1000);

const app = express();

// Trust the first proxy (nginx/Traefik/Caddy) so req.protocol reflects X-Forwarded-Proto
app.set('trust proxy', 1);

app.use(cors());
app.use(express.json());

// API routes
app.use('/api/webhook', webhookRouter);
app.use('/api/events', eventsRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/version', versionRouter);

// Serve frontend static files when the production build is present
const publicDir = path.join(__dirname, '..', 'public');
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
  app.use((_req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`ImagePulse listening on port ${PORT}`);
});

export default app;
