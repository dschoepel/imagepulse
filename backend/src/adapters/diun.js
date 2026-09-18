/**
 * @param {object} body - Raw DIUN webhook payload (flat structure)
 * @returns {{ image: string, tag: string, digest: string, status: string, source: string, rawPayload: object }}
 */
export function normaliseDiun(body) {
  const rawImage = body.image ?? '';

  // Strip a digest pin (@sha256:<hex>, or any @<algo>:<hex>) before splitting
  // on the tag. Diun already reports the digest separately via body.digest —
  // without this, a digest-pinned reference like "image@sha256:abcd1234"
  // gets mis-split on the colon *inside* the digest itself, producing
  // image="image@sha256" and tag="abcd1234" instead of the real image/tag.
  // Handles both "repo@sha256:digest" and "repo:tag@sha256:digest".
  const atIdx = rawImage.lastIndexOf('@');
  const digestPin = atIdx !== -1 ? rawImage.slice(atIdx) : '';
  const withoutDigest = /^@[a-zA-Z0-9_+.-]+:[a-fA-F0-9]+$/.test(digestPin)
    ? rawImage.slice(0, atIdx)
    : rawImage;

  const lastColon = withoutDigest.lastIndexOf(':');
  const image = lastColon !== -1 ? withoutDigest.slice(0, lastColon) : withoutDigest;
  const tag = lastColon !== -1 ? withoutDigest.slice(lastColon + 1) : 'latest';

  return {
    image,
    tag,
    digest: body.digest ?? '',
    status: body.status ?? 'unknown',
    source: 'diun',
    rawPayload: body,
  };
}
