// TODO: Send an email notification via nodemailer.

/**
 * Send an email notification.
 * @param {{ subject: string, text: string, html?: string }} message
 * @returns {Promise<void>}
 */
export async function sendEmail({ subject, text, html }) {
  // TODO: create nodemailer transporter from env vars and send message
  // SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS
  // EMAIL_FROM, EMAIL_TO
  console.log('[email stub] would send:', { subject, text });
}
