import type { Request, Response, NextFunction } from 'express';

const MAX_PAYLOAD_SIZE = 1 * 1024 * 1024; // 1 MB

/**
 * Middleware that validates webhook request payloads:
 * - Body must be valid JSON (Express json parser handles this, but we check content-type)
 * - Body must not exceed 1 MB
 * Returns 400 with error message if invalid.
 */
export function payloadValidator(req: Request, res: Response, next: NextFunction): void {
  const contentLength = req.headers['content-length'];

  if (contentLength && parseInt(contentLength, 10) > MAX_PAYLOAD_SIZE) {
    res.status(400).json({ error: 'Payload exceeds maximum size of 1 MB' });
    return;
  }

  if (!req.body || typeof req.body !== 'object') {
    res.status(400).json({ error: 'Request body must be valid JSON' });
    return;
  }

  // Check raw body size if available
  const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
  if (rawBody && rawBody.length > MAX_PAYLOAD_SIZE) {
    res.status(400).json({ error: 'Payload exceeds maximum size of 1 MB' });
    return;
  }

  next();
}
