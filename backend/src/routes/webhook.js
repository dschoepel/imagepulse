import { Router } from 'express';
import { parseWebhook } from '../adapters/index.js';
import { insertEvent, markNotified, getSetting, pruneOldEvents, getDb } from '../db/index.js';
import { fetchReleaseNotes } from '../services/github.js';
import { sendNtfy } from '../services/ntfy.js';
import { sendEmail } from '../services/email.js';
import { buildEmailHtml } from '../services/emailTemplate.js';

const router = Router();

// Return value or '(unknown)' when blank/absent
const na = v => (v && String(v).trim()) ? String(v).trim() : '(unknown)';

router.post('/', async (req, res) => {
  try {
    // Validate shared secret if one is configured
    const secret = getSetting('webhook_secret');
    if (secret) {
      const auth = req.headers['authorization'] || '';
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
      if (token !== secret) {
        return res.status(401).json({ ok: false, error: 'Unauthorized' });
      }
    }

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

    // Resolve metadata fields — always shown, (unknown) when blank
    const hostname    = na(event.rawPayload?.hostname);
    const platform    = na(event.rawPayload?.platform);
    const digestShort = na((event.digest || '').slice(0, 12) || '');
    const status      = na(event.status);

    // Base body (stored in DB — no release notes text, no truncation)
    let baseBody = `Host: ${hostname}\nStatus: ${status}\nDigest: ${digestShort}\nPlatform: ${platform}`;
    if (event.tag === 'latest' && releaseNotes?.name) {
      baseBody += `\nRelease: ${releaseNotes.name}`;
    }
    baseBody += '\nvia ImagePulse';

    // ntfy body — append release notes truncated to 300 chars
    const ntfyBody = releaseNotes?.body
      ? `${baseBody}\n\n${releaseNotes.body.slice(0, 300)}`
      : baseBody;

    // ntfy tags and priority — status-aware
    const ntfyTags     = event.status === 'new' ? ['whale', 'white_check_mark'] : ['whale', 'arrows_counterclockwise'];
    const ntfyPriority = event.status === 'new' ? 3 : 4;

    // Notification title (ntfy) and email subject
    const title   = `Image updated: ${event.image}:${event.tag}`;
    const subject = `[ImagePulse] ${title}`;

    // Email plain-text fallback
    const emailBody = releaseNotes?.body
      ? `${baseBody}\n\n${releaseNotes.body}`
      : baseBody;

    // Send ntfy notification
    if (getSetting('ntfy_enabled') === 'true') {
      try {
        await sendNtfy({
          title,
          body: ntfyBody,
          tags: ntfyTags,
          priority: ntfyPriority,
          clickUrl: releaseNotes?.url ?? null,
        });
      } catch (err) {
        console.error('ntfy notification failed:', err.message);
      }
    }

    // Send email notification
    if (getSetting('email_enabled') === 'true') {
      try {
        const html = buildEmailHtml({
          image:        event.image,
          tag:          event.tag,
          status,
          hostname,
          digest:       digestShort,
          platform,
          releaseNotes,
        });
        await sendEmail({ subject, text: emailBody, html });
      } catch (err) {
        console.error('Email notification failed:', err.message);
      }
    }

    // Store the full base body (no truncation) in the DB
    markNotified(id, title, baseBody, releaseNotes?.url ?? null);

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
