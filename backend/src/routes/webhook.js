// TODO: Handle incoming webhook POST requests.
// 1. Parse + normalise via adapter
// 2. Persist event to DB
// 3. Look up image→repo mapping
// 4. Fetch release notes from GitHub
// 5. Send notifications (ntfy / email)

import { Router } from 'express';
import { parseWebhook } from '../adapters/index.js';

const router = Router();

router.post('/', async (req, res) => {
  try {
    const event = parseWebhook(req);
    // TODO: persist event, fetch release notes, send notifications
    console.log('Received webhook event:', event);
    res.status(202).json({ ok: true, event });
  } catch (err) {
    console.error('Webhook error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
