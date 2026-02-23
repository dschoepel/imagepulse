// TODO: CRUD for settings (ntfy/email config, retention) and image→repo mappings.

import { Router } from 'express';
import { getDb } from '../db/index.js';

const router = Router();

// --- Settings ---

router.get('/', (req, res) => {
  try {
    const db = getDb();
    // TODO: return all settings as a key→value object
    const rows = db.prepare('SELECT key, value FROM settings').all();
    const settings = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    res.json({ ok: true, settings });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.put('/', (req, res) => {
  try {
    const db = getDb();
    // TODO: validate and upsert settings from req.body
    const upsert = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
    const updateAll = db.transaction((data) => {
      for (const [key, value] of Object.entries(data)) {
        upsert.run(key, String(value));
      }
    });
    updateAll(req.body);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
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
    const db = getDb();
    const { image, repo } = req.body;
    // TODO: validate input
    db.prepare('INSERT OR REPLACE INTO mappings (image, repo) VALUES (?, ?)').run(image, repo);
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
