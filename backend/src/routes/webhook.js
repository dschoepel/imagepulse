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
    let basebody = `Status: ${event.status}`;
    if (digestShort) basebody += `\nDigest: ${digestShort}`;
    if (event.rawPayload?.platform) basebody += `\nPlatform: ${event.rawPayload.platform}`;

    // ntfy body — release notes truncated to 300 chars (push notification limit)
    const ntfyBody = releaseNotes?.body
      ? `${basebody}\n\n${releaseNotes.body.slice(0, 300)}`
      : basebody;

    // Email body — full release notes text
    const emailBody = releaseNotes?.body
      ? `${basebody}\n\n${releaseNotes.body}`
      : basebody;

    // Send ntfy notification
    if (getSetting('ntfy_enabled') === 'true') {
      try {
        await sendNtfy({ title, body: ntfyBody, tags: ['whale'], priority: 3 });
      } catch (err) {
        console.error('ntfy notification failed:', err.message);
      }
    }

    // Send email notification
    if (getSetting('email_enabled') === 'true') {
      try {
        await sendEmail({ subject: title, text: emailBody });
      } catch (err) {
        console.error('Email notification failed:', err.message);
      }
    }

    // Store the ntfy body in the DB (used for UI display and resend)
    markNotified(id, title, ntfyBody, releaseNotes?.url ?? null);

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
