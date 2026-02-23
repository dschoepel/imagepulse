import { normaliseDiun } from './diun.js';

/**
 * Detect the webhook source from the request and normalise the payload.
 * @param {import('express').Request} req
 * @returns {{ image: string, tag: string, digest: string, status: string, source: string, rawPayload: object }}
 */
export function parseWebhook(req) {
  const body = req.body;

  if (body.diun_version !== undefined) {
    return normaliseDiun(body);
  }

  return {
    image: '',
    tag: 'latest',
    digest: '',
    status: 'unknown',
    source: 'unknown',
    rawPayload: body,
  };
}
