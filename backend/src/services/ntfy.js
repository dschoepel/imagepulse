import fetch from 'node-fetch';
import { getSetting } from '../db/index.js';

/**
 * Send an ntfy push notification.
 * @param {{ title: string, body: string, tags?: string[], priority?: number }} notification
 * @returns {Promise<void>}
 */
export async function sendNtfy({ title, body, tags = [], priority = 3 }) {
  const url   = getSetting('ntfy_url')   || process.env.NTFY_URL   || 'https://ntfy.sh';
  const topic = getSetting('ntfy_topic') || process.env.NTFY_TOPIC;
  const token = getSetting('ntfy_token') || process.env.NTFY_TOKEN;

  if (!topic) throw new Error('NTFY_TOPIC is not configured');

  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${url}/${topic}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ title, message: body, tags, priority }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ntfy responded ${res.status}: ${text}`);
  }
}
