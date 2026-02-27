import { Router } from 'express';
import logger from '../logger.js';
import { getEvents, getEventCount, getEventStats, getEventById, getChartData, getSetting } from '../db/index.js';
import { sendNtfy } from '../services/ntfy.js';
import { sendEmail } from '../services/email.js';
import { buildEmailHtml } from '../services/emailTemplate.js';

const na = v => (v && String(v).trim()) ? String(v).trim() : '(unknown)';

const router = Router();

router.get('/stats', (req, res) => {
  try {
    const stats = getEventStats();
    res.json({ ok: true, ...stats, lastUpdated: stats.lastCreatedAt });
  } catch (err) {
    logger.error({ err }, 'Stats error');
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/chart-data', (req, res) => {
  try {
    res.json({ ok: true, ...getChartData() });
  } catch (err) {
    logger.error({ err }, 'Chart data error');
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/', (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '25', 10)));
    const image = req.query.image || '';
    const status = req.query.status || '';
    const sortBy = req.query.sortBy || 'created_at';
    const sortDir = req.query.sortDir || 'desc';

    const events = getEvents({ page, limit, image, status, sortBy, sortDir });
    const total = getEventCount({ image, status });
    const pages = Math.ceil(total / limit) || 1;

    res.json({ ok: true, events, pagination: { page, limit, total, pages } });
  } catch (err) {
    logger.error({ err }, 'Events list error');
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/:id/resend', async (req, res) => {
  try {
    const ev = getEventById(Number(req.params.id));
    if (!ev) return res.status(404).json({ ok: false, error: 'Event not found' });
    if (!ev.notification_title) return res.status(400).json({ ok: false, error: 'No notification content stored' });

    // Derive the public base URL from the incoming request (respects X-Forwarded-Proto via trust proxy)
    const appBaseUrl = `${req.protocol}://${req.get('host')}`;

    // Derive tags and priority from stored status (no whale; icon header used instead)
    const ntfyTags     = ev.status === 'new' ? ['white_check_mark'] : ['arrows_counterclockwise'];
    const ntfyPriority = ev.status === 'new' ? 3 : 4;

    const errors = [];
    if (getSetting('ntfy_enabled') === 'true') {
      try {
        await sendNtfy({
          title:    ev.notification_title,
          body:     ev.notification_body,
          tags:     ntfyTags,
          priority: ntfyPriority,
          clickUrl: ev.github_release_url ?? null,
          iconUrl:  `${appBaseUrl}/favicon.ico`,
        });
      } catch (e) { errors.push(`ntfy: ${e.message}`); }
    }
    if (getSetting('email_enabled') === 'true') {
      try {
        // Reconstruct metadata from stored raw_payload
        let rawPayload = {};
        try { rawPayload = JSON.parse(ev.raw_payload || '{}'); } catch {}

        const hostname = na(rawPayload.hostname);
        const platform = na(rawPayload.platform);
        const digestShort = na((ev.digest || '').slice(0, 12) || '');

        // Build minimal releaseNotes — only url available on resend (no body stored)
        const releaseNotes = ev.github_release_url ? { url: ev.github_release_url } : null;

        const html = buildEmailHtml({
          image:    ev.image,
          tag:      ev.tag,
          status:   na(ev.status),
          hostname,
          digest:   digestShort,
          platform,
          resolvedVersion: ev.resolved_version ?? null,
          releaseNotes,
          appBaseUrl,
        });

        await sendEmail({
          subject: `[ImagePulse] ${ev.notification_title}`,
          text:    ev.notification_body,
          html,
        });
      } catch (e) { errors.push(`email: ${e.message}`); }
    }
    if (errors.length) return res.status(500).json({ ok: false, error: errors.join('; ') });
    logger.info({ id: ev.id }, 'Notification resent');
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, 'Resend error');
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
