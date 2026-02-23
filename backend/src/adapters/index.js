// TODO: Adapter registry — detect payload source and dispatch to the right normaliser.
// Each adapter returns a normalised event object:
// { image, tag, digest, status, source, rawPayload }

import { normaliseDiun } from './diun.js';

/**
 * Detect the webhook source from the request and normalise the payload.
 * @param {import('express').Request} req
 * @returns {{ image: string, tag: string, digest: string, status: string, source: string, rawPayload: object }}
 */
export function parseWebhook(req) {
  // TODO: add detection logic for other sources (Watchtower, Portainer, etc.)
  // For now, assume all payloads are from DIUN.
  return normaliseDiun(req.body);
}
