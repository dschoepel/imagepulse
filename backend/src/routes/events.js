import { Router } from 'express';
import { getEvents, getEventCount, getEventStats } from '../db/index.js';

const router = Router();

router.get('/stats', (req, res) => {
  try {
    const stats = getEventStats();
    res.json({ ok: true, ...stats, lastUpdated: stats.lastCreatedAt });
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/', (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '25', 10)));
    const image = req.query.image || '';
    const status = req.query.status || '';

    const events = getEvents({ page, limit, image, status });
    const total = getEventCount({ image, status });
    const pages = Math.ceil(total / limit) || 1;

    res.json({ ok: true, events, pagination: { page, limit, total, pages } });
  } catch (err) {
    console.error('Events error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
