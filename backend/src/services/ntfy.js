// TODO: Send a notification to an ntfy topic.

/**
 * Send an ntfy push notification.
 * @param {{ title: string, body: string, tags?: string[], priority?: number }} notification
 * @returns {Promise<void>}
 */
export async function sendNtfy({ title, body, tags = [], priority = 3 }) {
  // TODO: implement ntfy HTTP API call
  // POST {NTFY_URL}/{NTFY_TOPIC}
  // Headers: Authorization: Bearer {NTFY_TOKEN} (if set)
  console.log('[ntfy stub] would send:', { title, body, tags, priority });
}
