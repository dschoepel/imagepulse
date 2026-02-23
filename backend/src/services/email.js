import nodemailer from 'nodemailer';

/**
 * Send an email notification.
 * @param {{ subject: string, text: string, html?: string }} message
 * @returns {Promise<void>}
 */
export async function sendEmail({ subject, text, html }) {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });

  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to: process.env.EMAIL_TO,
    subject,
    text,
    html,
  });
}
