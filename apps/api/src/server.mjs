import express from 'express';
import { z } from 'zod';

const app = express();
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => res.json({ ok: true, service: 'api' }));

const envelopeSchema = z.object({
  envelopeVersion: z.number().int().min(1),
  messageId: z.string().uuid(),
  channelId: z.string().uuid(),
  senderUserId: z.string().uuid(),
  senderDeviceId: z.string().uuid().optional(),
  sentAt: z.string(),
  ciphertext: z.string(),
  nonce: z.string(),
  keyId: z.string(),
  signature: z.string().optional()
});

app.post('/v1/messages/send', (req, res) => {
  const parsed = envelopeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_envelope' });
  // TODO: enforce ACL/rate limits and persist ciphertext envelope
  return res.status(202).json({ accepted: true, messageId: parsed.data.messageId });
});

const port = process.env.API_PORT || 4000;
app.listen(port, () => console.log(`api listening on :${port}`));
