/**
 * @module feedback
 * Bug report endpoint. Sends user-submitted bug reports to the team inbox
 * via the Resend email API with optional screenshot attachments.
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { env } from '@ripcord/config';
import { requireAuth } from '../middleware/require-auth.js';
import { rateLimit } from '../middleware/rate-limit.js';
import { logger } from '../logger.js';

export const feedbackRouter: Router = Router();

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_COMPONENTS = ['UI', 'BUG', 'Voice', 'Chat', 'Friends list', 'Other'] as const;
const MAX_DESCRIPTION_LENGTH = 1000;
const BUG_REPORT_RECIPIENT = 'ripcordtheapp@gmail.com';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateBugId(): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const hex = Math.random().toString(16).slice(2, 6);
  return `BUG-${date}-${hex}`;
}

async function sendBugReportEmail(
  to: string,
  subject: string,
  html: string,
  attachment?: { filename: string; content: string },
): Promise<void> {
  if (!env.RESEND_API_KEY) {
    logger.warn({ to, subject }, 'RESEND_API_KEY not set — bug report email not sent (dev mode)');
    return;
  }

  const body: Record<string, unknown> = {
    from: env.EMAIL_FROM,
    to,
    subject,
    html,
  };

  if (attachment) {
    body.attachments = [attachment];
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    logger.error({ status: res.status, body: text, to }, 'Resend API error (bug report)');
    throw new Error(`Failed to send bug report email: ${res.status}`);
  }

  logger.info({ to, subject }, 'Bug report email sent');
}

// ---------------------------------------------------------------------------
// POST /v1/feedback
// ---------------------------------------------------------------------------

feedbackRouter.post(
  '/',
  requireAuth,
  rateLimit({ windowMs: 60_000, max: 5, keyPrefix: 'rl:feedback' }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { component, description, screenshot } = req.body ?? {};

      // --- Validation ---
      if (!component || !VALID_COMPONENTS.includes(component)) {
        res.status(400).json({
          ok: false,
          error: `component must be one of: ${VALID_COMPONENTS.join(', ')}`,
        });
        return;
      }

      if (!description || typeof description !== 'string') {
        res.status(400).json({ ok: false, error: 'description is required' });
        return;
      }

      if (description.length > MAX_DESCRIPTION_LENGTH) {
        res.status(400).json({
          ok: false,
          error: `description must be ${MAX_DESCRIPTION_LENGTH} characters or fewer`,
        });
        return;
      }

      if (screenshot && typeof screenshot !== 'string') {
        res.status(400).json({ ok: false, error: 'screenshot must be a base64 string' });
        return;
      }

      // --- Build email ---
      const bugId = generateBugId();
      const userId = req.auth!.sub;
      const timestamp = new Date().toISOString();

      const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #1a1a2e; color: #e0e0e0; padding: 40px 20px;">
  <div style="max-width: 560px; margin: 0 auto; background: #16213e; border-radius: 12px; padding: 32px;">
    <h1 style="color: #00f0ff; font-size: 20px; margin: 0 0 4px;">Bug Report: ${component}</h1>
    <p style="color: #a0a0b8; font-size: 13px; margin: 0 0 24px;">${bugId} &middot; ${timestamp}</p>
    <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
      <tr>
        <td style="color: #a0a0b8; padding: 8px 12px 8px 0; vertical-align: top; white-space: nowrap;">Component</td>
        <td style="color: #ffffff; padding: 8px 0;">${component}</td>
      </tr>
      <tr>
        <td style="color: #a0a0b8; padding: 8px 12px 8px 0; vertical-align: top; white-space: nowrap;">User ID</td>
        <td style="color: #ffffff; padding: 8px 0; font-family: monospace; font-size: 12px;">${userId}</td>
      </tr>
      <tr>
        <td style="color: #a0a0b8; padding: 8px 12px 8px 0; vertical-align: top; white-space: nowrap;">Description</td>
        <td style="color: #ffffff; padding: 8px 0; white-space: pre-wrap;">${description.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</td>
      </tr>
    </table>
    ${screenshot ? '<p style="color: #a0a0b8; font-size: 13px; margin: 24px 0 0;">Screenshot attached.</p>' : ''}
  </div>
</body>
</html>`.trim();

      // --- Send email ---
      const attachment = screenshot
        ? { filename: `${bugId}-screenshot.png`, content: screenshot }
        : undefined;

      await sendBugReportEmail(BUG_REPORT_RECIPIENT, `Bug Report: ${component}`, html, attachment);

      res.json({ ok: true, bugId });
    } catch (err) {
      next(err);
    }
  },
);
