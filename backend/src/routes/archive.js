import { Router } from 'express';
import { getArchivedEvents, getArchivedEventCount } from '../db/index.js';

const router = Router();

router.get('/', (req, res) => {
  try {
    const page    = Math.max(1, parseInt(req.query.page  || '1',  10));
    const limit   = Math.min(100, Math.max(1, parseInt(req.query.limit || '25', 10)));
    const image   = req.query.image  || '';
    const status  = req.query.status || '';
    const sortBy  = req.query.sortBy  || 'archived_at';
    const sortDir = req.query.sortDir || 'desc';

    const events = getArchivedEvents({ page, limit, image, status, sortBy, sortDir });
    const total  = getArchivedEventCount({ image, status });
    const pages  = Math.max(1, Math.ceil(total / limit));

    res.json({ ok: true, events, pagination: { page, pages, total } });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
