import { Router } from 'express';
import { parseWebhook } from '../adapters/index.js';
import { insertEvent, markNotified, getSetting, pruneOldEvents, getDb } from '../db/index.js';
import { fetchReleaseNotes } from '../services/github.js';
import { sendNtfy } from '../services/ntfy.js';
import { sendEmail } from '../services/email.js';

const router = Router();

router.post('/', async (req, res) => {
  try {
    const event = parseWebhook(req);
    const id = insertEvent(event);

    // Look up image→repo mapping
    const db = getDb();
    const mapping = db.prepare('SELECT repo FROM mappings WHERE image = ?').get(event.image);

    // Fetch release notes if mapping exists
    let releaseNotes = null;
    if (mapping) {
      releaseNotes = await fetchReleaseNotes(mapping.repo, event.tag);
    }

    // Build notification content
    const title = `Image updated: ${event.image}:${event.tag}`;
    const digestShort = (event.digest || '').slice(0, 12);
    let body = `Status: ${event.status}`;
    if (digestShort) body += `\nDigest: ${digestShort}`;
    if (event.rawPayload?.platform) body += `\nPlatform: ${event.rawPayload.platform}`;
    if (releaseNotes?.body) {
      body += `\n\n${releaseNotes.body.slice(0, 300)}`;
    }

    // Send ntfy notification
    if (getSetting('ntfy_enabled') === 'true') {
      try {
        await sendNtfy({ title, body, tags: ['whale'], priority: 3 });
      } catch (err) {
        console.error('ntfy notification failed:', err.message);
      }
    }

    // Send email notification
    if (getSetting('email_enabled') === 'true') {
      try {
        await sendEmail({ subject: title, text: body });
      } catch (err) {
        console.error('Email notification failed:', err.message);
      }
    }

    markNotified(id);

    // Prune old events if retention is configured
    const retentionDays = parseInt(getSetting('retention_days') || '0', 10);
    if (retentionDays > 0) {
      const deleted = pruneOldEvents(retentionDays);
      if (deleted > 0) console.log(`Pruned ${deleted} old event(s)`);
    }

    res.status(202).json({ ok: true, id, event });
  } catch (err) {
    console.error('Webhook error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
