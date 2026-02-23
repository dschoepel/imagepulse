/**
 * @param {object} body - Raw DIUN webhook payload (flat structure)
 * @returns {{ image: string, tag: string, digest: string, status: string, source: string, rawPayload: object }}
 */
export function normaliseDiun(body) {
  const rawImage = body.image ?? '';
  const lastColon = rawImage.lastIndexOf(':');
  const image = lastColon !== -1 ? rawImage.slice(0, lastColon) : rawImage;
  const tag = lastColon !== -1 ? rawImage.slice(lastColon + 1) : 'latest';

  return {
    image,
    tag,
    digest: body.digest ?? '',
    status: body.status ?? 'unknown',
    source: 'diun',
    rawPayload: body,
  };
}
