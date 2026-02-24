import { Router } from 'express';
import { getEvents, getEventCount, getEventStats, getEventById, getChartData, getSetting } from '../db/index.js';
import { sendNtfy } from '../services/ntfy.js';
import { sendEmail } from '../services/email.js';

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

router.get('/chart-data', (req, res) => {
  try {
    res.json({ ok: true, ...getChartData() });
  } catch (err) {
    console.error('Chart data error:', err);
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

router.post('/:id/resend', async (req, res) => {
  try {
    const ev = getEventById(Number(req.params.id));
    if (!ev) return res.status(404).json({ ok: false, error: 'Event not found' });
    if (!ev.notification_title) return res.status(400).json({ ok: false, error: 'No notification content stored' });

    const errors = [];
    if (getSetting('ntfy_enabled') === 'true') {
      try { await sendNtfy({ title: ev.notification_title, body: ev.notification_body, tags: ['whale'], priority: 3 }); }
      catch (e) { errors.push(`ntfy: ${e.message}`); }
    }
    if (getSetting('email_enabled') === 'true') {
      try { await sendEmail({ subject: ev.notification_title, text: ev.notification_body }); }
      catch (e) { errors.push(`email: ${e.message}`); }
    }
    if (errors.length) return res.status(500).json({ ok: false, error: errors.join('; ') });
    res.json({ ok: true });
  } catch (err) {
    console.error('Resend error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
