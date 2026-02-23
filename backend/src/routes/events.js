// TODO: Return paginated event history from the database.

import { Router } from 'express';
import { getDb } from '../db/index.js';

const router = Router();

router.get('/', (req, res) => {
  try {
    const db = getDb();
    // TODO: add pagination, filtering, and search
    const events = db.prepare('SELECT * FROM events ORDER BY created_at DESC LIMIT 100').all();
    res.json({ ok: true, events });
  } catch (err) {
    console.error('Events error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
