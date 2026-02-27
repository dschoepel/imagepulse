import { Router } from 'express';
import fetch from 'node-fetch';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { version: current } = require('../../package.json');

const router = Router();

const CACHE_TTL = 60 * 60 * 1000; // 1 hour
let cache = null; // { data: { latest, latestUrl, hasUpdate }, fetchedAt }

router.get('/', async (_req, res) => {
  // Return cached result if still fresh
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL) {
    return res.json({ ok: true, current, ...cache.data });
  }

  try {
    const response = await fetch(
      'https://api.github.com/repos/dschoepel/imagepulse/releases/latest',
      {
        headers: {
          'User-Agent': 'ImagePulse/1.0',
          'Accept': 'application/vnd.github.v3+json',
        },
      }
    );

    if (!response.ok) {
      // GitHub unavailable or no releases yet — cache a null result so we don't hammer the API
      cache = { data: { latest: null, latestUrl: null, hasUpdate: false }, fetchedAt: Date.now() };
      return res.json({ ok: true, current, ...cache.data });
    }

    const release = await response.json();
    const latest = release.tag_name ? release.tag_name.replace(/^v/, '') : null;
    const latestUrl = release.html_url ?? null;
    const hasUpdate = latest ? latest !== current : false;

    cache = { data: { latest, latestUrl, hasUpdate }, fetchedAt: Date.now() };
    res.json({ ok: true, current, latest, latestUrl, hasUpdate });
  } catch {
    // Network error — cache a null result
    cache = { data: { latest: null, latestUrl: null, hasUpdate: false }, fetchedAt: Date.now() };
    res.json({ ok: true, current, latest: null, latestUrl: null, hasUpdate: false });
  }
});

export default router;
