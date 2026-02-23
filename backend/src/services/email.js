import nodemailer from 'nodemailer';
import { getSetting } from '../db/index.js';

/**
 * Send an email notification.
 * @param {{ subject: string, text: string, html?: string }} message
 * @returns {Promise<void>}
 */
export async function sendEmail({ subject, text, html }) {
  const host   = getSetting('smtp_host')   || process.env.SMTP_HOST;
  const port   = getSetting('smtp_port')   || process.env.SMTP_PORT   || '587';
  const secure = getSetting('smtp_secure') || process.env.SMTP_SECURE || 'false';
  const user   = getSetting('smtp_user')   || process.env.SMTP_USER;
  const pass   = getSetting('smtp_pass')   || process.env.SMTP_PASS;
  const from   = getSetting('email_from')  || process.env.EMAIL_FROM;
  const to     = getSetting('email_to')    || process.env.EMAIL_TO;

  const transporter = nodemailer.createTransport({
    host,
    port: Number(port),
    secure: secure === 'true',
    auth: user ? { user, pass } : undefined,
  });

  await transporter.sendMail({ from, to, subject, text, html });
}
