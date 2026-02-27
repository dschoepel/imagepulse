/**
 * Build an HTML email for an image update notification.
 * @param {{ image: string, tag: string, status: string, hostname: string, digest: string, platform: string, resolvedVersion?: string|null, releaseNotes?: { name?: string, body?: string, url?: string }|null, appBaseUrl?: string }} params
 * @returns {string} HTML string
 */
export function buildEmailHtml({ image, tag, status, hostname, digest, platform, resolvedVersion, releaseNotes, appBaseUrl = '' }) {
  const isNew = status === 'new';
  const statusLabel = isNew ? 'NEW' : 'UPDATE';
  const badgeColor  = isNew ? '#16a34a' : '#d97706';

  const rows = [
    ['Status',   status],
    ['Digest',   digest],
    ['Platform', platform],
  ];
  if (resolvedVersion) {
    rows.push(['Version', resolvedVersion]);
  }

  const metaRows = rows.map(([label, value]) => `
    <tr>
      <td style="padding:6px 12px 6px 0;font-weight:700;color:#374151;font-size:13px;white-space:nowrap;vertical-align:top;">${label}:</td>
      <td style="padding:6px 0;color:#111827;font-size:13px;word-break:break-all;">${escHtml(value)}</td>
    </tr>`).join('');

  const releaseLabel = releaseNotes?.name || resolvedVersion || '';
  const releaseSection = releaseNotes ? `
    <tr><td style="padding:0;">
      <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e5e7eb;">
        <tr><td style="padding:16px 24px 8px;">
          <p style="margin:0 0 10px;font-size:14px;font-weight:600;color:#111827;">
            Release Notes${releaseLabel ? ` — ${escHtml(releaseLabel)}` : ''}
          </p>
          ${releaseNotes.body ? `<pre style="margin:0 0 12px;padding:12px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:4px;font-size:12px;line-height:1.5;color:#374151;white-space:pre-wrap;word-break:break-word;overflow-wrap:break-word;">${escHtml(releaseNotes.body)}</pre>` : ''}
          ${releaseNotes.url ? `<a href="${escAttr(releaseNotes.url)}" style="display:inline-block;padding:8px 16px;background:#4f46e5;color:#ffffff;text-decoration:none;border-radius:4px;font-size:13px;font-weight:500;">View Release Notes ↗</a>` : ''}
        </td></tr>
      </table>
    </td></tr>` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">

      <!-- Header -->
      <tr><td style="background:#4f46e5;padding:20px 24px;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="color:#ffffff;">
              <img src="${escAttr(appBaseUrl)}/favicon.ico" alt="" width="24" height="24"
                   style="vertical-align:middle;margin-right:8px;border-radius:3px;" />
              <span style="font-size:20px;font-weight:700;color:#ffffff;vertical-align:middle;">${escHtml(hostname)} / ${escHtml(image)}:${escHtml(tag)}</span>
            </td>
            <td align="right" style="vertical-align:top;">
              <span style="display:inline-block;padding:4px 10px;background:${badgeColor};color:#ffffff;border-radius:4px;font-size:11px;font-weight:700;letter-spacing:0.05em;">${statusLabel}</span>
            </td>
          </tr>
        </table>
      </td></tr>

      <!-- Metadata table -->
      <tr><td style="padding:16px 24px;">
        <table cellpadding="0" cellspacing="0">
          ${metaRows}
        </table>
      </td></tr>

      <!-- Release notes (conditional) -->
      ${releaseSection}

      <!-- Footer -->
      <tr><td style="border-top:1px solid #e5e7eb;padding:14px 24px;background:#f9fafb;">
        <p style="margin:0;font-size:12px;color:#9ca3af;">
          Sent by <a href="https://github.com/dprice505/imagepulse" style="color:#4f46e5;text-decoration:none;">ImagePulse</a>
        </p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;
}

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escAttr(str) {
  return String(str ?? '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
