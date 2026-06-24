import type { Request, Response, NextFunction } from 'express';
import { validateSignature } from '@task-orchestrator/shared';
import type { WebhookRegistration } from '@task-orchestrator/shared';

/**
 * Factory that creates HMAC validation middleware.
 * If the webhook has a registered secret, validates the X-Hub-Signature-256 header.
 * Returns 401 for missing or invalid signature (no details to prevent information leakage).
 */
export function createHmacValidator(getWebhook: () => WebhookRegistration | null) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const webhook = getWebhook();

    if (!webhook || !webhook.secret) {
      // No secret configured — skip HMAC validation
      next();
      return;
    }

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

    next();
  };
}
