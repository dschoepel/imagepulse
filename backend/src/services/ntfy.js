import fetch from 'node-fetch';

/**
 * Send an ntfy push notification.
 * @param {{ title: string, body: string, tags?: string[], priority?: number }} notification
 * @returns {Promise<void>}
 */
export async function sendNtfy({ title, body, tags = [], priority = 3 }) {
  const url = process.env.NTFY_URL || 'https://ntfy.sh';
  const topic = process.env.NTFY_TOPIC;
  if (!topic) throw new Error('NTFY_TOPIC is not configured');

  const headers = { 'Content-Type': 'application/json' };
  if (process.env.NTFY_TOKEN) {
    headers['Authorization'] = `Bearer ${process.env.NTFY_TOKEN}`;
  }

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
