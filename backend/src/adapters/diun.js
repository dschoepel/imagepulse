// TODO: Normalise a DIUN webhook payload into the internal event format.
// DIUN payload reference: https://crazymax.dev/diun/notif/webhook/

/**
 * @param {object} body - Raw DIUN webhook payload
 * @returns {{ image: string, tag: string, digest: string, status: string, source: string, rawPayload: object }}
 */
export function normaliseDiun(body) {
  // TODO: implement field extraction from DIUN payload structure
  return {
    image: body?.entry?.image ?? '',
    tag: body?.entry?.tag ?? 'latest',
    digest: body?.entry?.digest ?? '',
    status: body?.status ?? 'unknown',
    source: 'diun',
    rawPayload: body,
  };
}
