import { Router } from 'express';
import fetch from 'node-fetch';
import { getDb } from '../db/index.js';
import { sendNtfy } from '../services/ntfy.js';
import { sendEmail } from '../services/email.js';

const router = Router();

// --- Settings ---

router.get('/', (req, res) => {
  try {
    const db = getDb();
    const rows = db.prepare('SELECT key, value FROM settings').all();
    const settings = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    res.json({ ok: true, settings });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.put('/', (req, res) => {
  try {
    const data = req.body;

    // Validate retention_days if present
    if ('retention_days' in data) {
      const val = Number(data.retention_days);
      if (!Number.isInteger(val) || val < 0) {
        return res.status(400).json({ ok: false, error: 'retention_days must be a non-negative integer' });
      }
    }

    const db = getDb();
    const upsert = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
    const updateAll = db.transaction((entries) => {
      for (const [key, value] of entries) {
        upsert.run(key, String(value));
      }
    });
    updateAll(Object.entries(data));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// --- Test endpoints ---

router.post('/test-ntfy', async (req, res) => {
  try {
    await sendNtfy({
      title: 'ImagePulse test notification',
      body: 'ntfy is configured correctly.',
      tags: ['white_check_mark'],
      priority: 3,
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/test-email', async (req, res) => {
  try {
    await sendEmail({
      subject: 'ImagePulse test email',
      text: 'Email notifications are configured correctly.',
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// --- Repo validation ---

router.get('/validate-mapping', async (req, res) => {
  const { repo } = req.query;
  if (!repo) {
    return res.status(400).json({ ok: false, error: 'repo query parameter is required' });
  }

  const parts = repo.split('/');
  if (parts.length !== 2 || !parts[0].trim() || !parts[1].trim()) {
    return res.json({ ok: true, repoExists: false, repoError: 'Must be in owner/repo format (e.g. nginx/nginx)' });
  }

  try {
    const headers = { 'User-Agent': 'ImagePulse/1.0' };
    if (process.env.GITHUB_TOKEN) {
      headers['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`;
    }
    const ghRes = await fetch(`https://api.github.com/repos/${repo}`, { headers });

    if (ghRes.ok) {
      return res.json({ ok: true, repoExists: true });
    }
    if (ghRes.status === 404) {
      return res.json({ ok: true, repoExists: false, repoError: 'Repository not found on GitHub' });
    }
    if (ghRes.headers.get('x-ratelimit-remaining') === '0') {
      return res.json({ ok: true, repoExists: null, repoError: 'GitHub API rate limit exceeded — cannot verify' });
    }
    return res.json({ ok: true, repoExists: null, repoError: `GitHub returned ${ghRes.status} — cannot verify` });
  } catch {
    return res.json({ ok: true, repoExists: null, repoError: 'Could not reach GitHub' });
  }
});

// --- Mappings ---

router.get('/mappings', (req, res) => {
  try {
    const db = getDb();
    const mappings = db.prepare('SELECT * FROM mappings ORDER BY image').all();
    res.json({ ok: true, mappings });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.put('/mappings', (req, res) => {
  try {
    const { image, repo } = req.body;
    if (!image || !repo) {
      return res.status(400).json({ ok: false, error: 'image and repo are required' });
    }
    const db = getDb();
    db.prepare('INSERT OR REPLACE INTO mappings (image, repo) VALUES (?, ?)').run(image, repo);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.patch('/mappings/:image', (req, res) => {
  try {
    const { newImage, repo } = req.body;
    const oldImage = req.params.image;
    if (!repo) return res.status(400).json({ ok: false, error: 'repo is required' });
    const db = getDb();
    const update = db.transaction(() => {
      if (newImage && newImage !== oldImage) {
        db.prepare('DELETE FROM mappings WHERE image = ?').run(oldImage);
        db.prepare('INSERT OR REPLACE INTO mappings (image, repo) VALUES (?, ?)').run(newImage, repo);
      } else {
        db.prepare('UPDATE mappings SET repo = ? WHERE image = ?').run(repo, oldImage);
      }
    });
    update();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.delete('/mappings/:image', (req, res) => {
  try {
    const db = getDb();
    db.prepare('DELETE FROM mappings WHERE image = ?').run(req.params.image);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
