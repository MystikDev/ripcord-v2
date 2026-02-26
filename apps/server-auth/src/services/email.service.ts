/**
 * @module email.service
 * Sends transactional emails via the Resend API.
 *
 * If `RESEND_API_KEY` is not configured (typical in local dev), codes are
 * logged to the console instead of being emailed.
 */

import { env } from '@ripcord/config';
import { logger } from '../logger.js';

// ---------------------------------------------------------------------------
// Low-level send
// ---------------------------------------------------------------------------

/**
 * Send an email via the Resend HTTP API.
 *
 * @param to      - Recipient email address.
 * @param subject - Email subject line.
 * @param html    - HTML body content.
 */
export async function sendEmail(
  to: string,
  subject: string,
  html: string,
): Promise<void> {
  if (!env.RESEND_API_KEY) {
    logger.warn({ to, subject }, 'RESEND_API_KEY not set — email not sent (dev mode)');
    return;
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to,
      subject,
      html,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    logger.error({ status: res.status, body, to }, 'Resend API error');
    throw new Error(`Failed to send email: ${res.status}`);
  }

  logger.debug({ to, subject }, 'Email sent via Resend');
}

// ---------------------------------------------------------------------------
// Verification email
// ---------------------------------------------------------------------------

/**
 * Send a 6-digit verification code email.
 *
 * In dev mode (no API key), the code is logged to the console.
 *
 * @param to   - Recipient email address.
 * @param code - The 6-digit verification code.
 */
export async function sendVerificationCode(
  to: string,
  code: string,
): Promise<void> {
  if (!env.RESEND_API_KEY) {
    logger.info(
      { to, code },
      '=== DEV MODE: Verification code (no RESEND_API_KEY) ===',
    );
    return;
  }

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #1a1a2e; color: #e0e0e0; padding: 40px 20px;">
  <div style="max-width: 420px; margin: 0 auto; background: #16213e; border-radius: 12px; padding: 32px; text-align: center;">
    <h1 style="color: #ffffff; font-size: 24px; margin: 0 0 8px;">Ripcord</h1>
    <p style="color: #a0a0b8; font-size: 14px; margin: 0 0 24px;">Verify your email to get started</p>
    <div style="background: #0f3460; border-radius: 8px; padding: 20px; margin: 0 0 24px;">
      <span style="font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #e94560;">${code}</span>
    </div>
    <p style="color: #a0a0b8; font-size: 13px; margin: 0;">
      This code expires in 15 minutes.<br/>
      If you didn't create a Ripcord account, you can ignore this email.
    </p>
  </div>
</body>
</html>`.trim();

  await sendEmail(to, 'Your Ripcord verification code', html);
}

// ---------------------------------------------------------------------------
// Password reset email
// ---------------------------------------------------------------------------

/**
 * Send a 6-digit password reset code email.
 *
 * In dev mode (no API key), the code is logged to the console.
 *
 * @param to   - Recipient email address.
 * @param code - The 6-digit reset code.
 */
export async function sendPasswordResetCode(
  to: string,
  code: string,
): Promise<void> {
  if (!env.RESEND_API_KEY) {
    logger.info(
      { to, code },
      '=== DEV MODE: Password reset code (no RESEND_API_KEY) ===',
    );
    return;
  }

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #1a1a2e; color: #e0e0e0; padding: 40px 20px;">
  <div style="max-width: 420px; margin: 0 auto; background: #16213e; border-radius: 12px; padding: 32px; text-align: center;">
    <h1 style="color: #ffffff; font-size: 24px; margin: 0 0 8px;">Ripcord</h1>
    <p style="color: #a0a0b8; font-size: 14px; margin: 0 0 24px;">Reset your password</p>
    <div style="background: #0f3460; border-radius: 8px; padding: 20px; margin: 0 0 24px;">
      <span style="font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #e94560;">${code}</span>
    </div>
    <p style="color: #a0a0b8; font-size: 13px; margin: 0;">
      This code expires in 15 minutes.<br/>
      If you didn't request a password reset, you can ignore this email.
    </p>
  </div>
</body>
</html>`.trim();

  await sendEmail(to, 'Your Ripcord password reset code', html);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Mask an email address for safe display.
 *
 * @example maskEmail("john@gmail.com") → "j***@gmail.com"
 * @example maskEmail("ab@example.com") → "a***@example.com"
 */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return '***@***';
  const visible = local.length <= 2 ? local[0] : local.slice(0, 2);
  return `${visible}***@${domain}`;
}
