import { Router } from 'express';
import logger from '../logger.js';
import { parseWebhook } from '../adapters/index.js';
import { insertEvent, markNotified, getSetting, pruneOldEvents, getDb } from '../db/index.js';
import { fetchReleaseNotes } from '../services/github.js';
import { resolveVersionTag } from '../services/registry.js';
import { sendNtfy } from '../services/ntfy.js';
import { sendEmail } from '../services/email.js';
import { buildEmailHtml } from '../services/emailTemplate.js';

const router = Router();

// Return value or '(unknown)' when blank/absent
const na = v => (v && String(v).trim()) ? String(v).trim() : '(unknown)';

router.post('/', async (req, res) => {
  try {
    // Build the icon URL for ntfy:
    //  1. APP_BASE_URL env var (explicit public URL — best option when DIUN calls ImagePulse
    //     on an internal Docker network where the derived URL would be unreachable by ntfy).
    //  2. Request-derived URL (works when behind a reverse proxy that passes X-Forwarded-* headers).
    //  3. Raw GitHub fallback — always reachable by ntfy as long as it has internet access.
    const FALLBACK_ICON = 'https://raw.githubusercontent.com/dschoepel/imagepulse/main/frontend/public/favicon.svg';
    const appBaseUrl = (process.env.APP_BASE_URL || '').replace(/\/$/, '')
      || `${req.protocol}://${req.get('host')}`;
    const ntfyIconUrl = appBaseUrl
      ? `${appBaseUrl}/favicon.ico`
      : FALLBACK_ICON;

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

    // Look up image→repo/url mapping
    const db = getDb();
    const mapping = db.prepare('SELECT * FROM mappings WHERE image = ?').get(event.image);

    // Fetch release notes if a GitHub mapping exists; for URL-type mappings use the URL as a click link
    let releaseNotes = null;
    if (mapping?.link_type === 'url' && mapping.url) {
      releaseNotes = { url: mapping.url };
    } else if (mapping?.repo) {
      releaseNotes = await fetchReleaseNotes(mapping.repo, event.tag);
    }

    // Resolve version tag from registry digest (latest-tagged images only)
    let resolvedVersion = null;
    if (event.tag === 'latest') {
      resolvedVersion = await resolveVersionTag(event.image, event.digest);
    }

    // Resolve metadata fields — always shown, (unknown) when blank
    const hostname    = na(event.rawPayload?.hostname);
    const platform    = na(event.rawPayload?.platform);
    const digestShort = na((event.digest || '').slice(0, 12) || '');
    const status      = na(event.status);

    // Base body (stored in DB — no release notes text, no truncation)
    let baseBody = `Host: ${hostname}\nStatus: ${status}\nDigest: ${digestShort}\nPlatform: ${platform}`;
    if (resolvedVersion) baseBody += `\nVersion: ${resolvedVersion}`;
    baseBody += '\nvia ImagePulse';

    // ntfy body — append release notes truncated to 300 chars
    const ntfyBody = releaseNotes?.body
      ? `${baseBody}\n\n${releaseNotes.body.slice(0, 300)}`
      : baseBody;

    // ntfy tags and priority — status-aware (no whale; icon header used instead)
    const ntfyTags     = event.status === 'new' ? ['white_check_mark'] : ['arrows_counterclockwise'];
    const ntfyPriority = event.status === 'new' ? 3 : 4;

    // Notification title (ntfy) and email subject
    const statusPhrase = event.status === 'new' ? 'is new' : 'has been updated';
    const title   = `${hostname}: ${event.image}:${event.tag} - ${statusPhrase}`;
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
          iconUrl: ntfyIconUrl,
        });
      } catch (err) {
        logger.error({ err: err.message }, 'ntfy notification failed');
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
          resolvedVersion,
          releaseNotes,
          appBaseUrl,
        });
        await sendEmail({ subject, text: emailBody, html });
      } catch (err) {
        logger.error({ err: err.message }, 'Email notification failed');
      }
    }

    // Store the full base body (no truncation) in the DB
    markNotified(id, title, baseBody, releaseNotes?.url ?? null, resolvedVersion);

    logger.info({ id, image: event.image, tag: event.tag, status: event.status }, 'Webhook processed');

    // Prune old events if retention is configured
    const retentionDays = parseInt(getSetting('retention_days') || '0', 10);
    if (retentionDays > 0) {
      const deleted = pruneOldEvents(retentionDays);
      if (deleted > 0) logger.info({ deleted }, 'Pruned old events after webhook');
    }

    res.status(202).json({ ok: true, id, event });
  } catch (err) {
    logger.error({ err }, 'Webhook error');
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
