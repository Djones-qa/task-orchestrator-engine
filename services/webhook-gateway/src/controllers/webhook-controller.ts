import type { Request, Response } from 'express';
import { getPool, validateSignature } from '@task-orchestrator/shared';
import type { WebhookRegistration } from '@task-orchestrator/shared';
import { forwardToScheduler } from '../services/webhook-forwarder.js';

/**
 * POST /api/v1/webhooks/:id
 * Validates webhook ID exists, validates payload, validates HMAC if secret,
 * forwards to Scheduler API, returns 202.
 */
export async function handleWebhook(req: Request, res: Response): Promise<void> {
  const { id } = req.params;

  // 1. Validate webhook ID exists in database
  const pool = getPool();
  const result = await pool.query<{
    id: string;
    workflow_id: string;
    secret: string | null;
    active: boolean;
  }>(
    'SELECT id, workflow_id, secret, active FROM webhook_registrations WHERE id = $1',
    [id]
  );

  if (result.rows.length === 0) {
    res.status(404).json({ error: 'Webhook not found' });
    return;
  }

  const webhook = result.rows[0];

  if (!webhook.active) {
    res.status(404).json({ error: 'Webhook not found' });
    return;
  }

  // 2. Validate HMAC signature if webhook has a secret
  if (webhook.secret) {
    const signatureHeader = req.headers['x-hub-signature-256'] as string | undefined;

    if (!signatureHeader) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
    if (!rawBody) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const isValid = validateSignature(rawBody, signatureHeader, webhook.secret);
    if (!isValid) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
  }

  // 3. Forward to Scheduler API
  const forwardResult = await forwardToScheduler(webhook.workflow_id, req.body);

  if (!forwardResult.success) {
    res.status(forwardResult.statusCode || 502).json({ error: forwardResult.error });
    return;
  }

  // 4. Return 202 Accepted
  res.status(202).json({
    message: 'Webhook accepted',
    executionId: forwardResult.executionId,
  });
}
