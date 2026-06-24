import express from 'express';
import type { Request, Response } from 'express';
import webhookRoutes from './routes/webhook-routes.js';

const app = express();

// Parse JSON with raw body preservation for HMAC validation
app.use(
  express.json({
    limit: '1mb',
    verify: (req: Request, _res: Response, buf: Buffer) => {
      (req as Request & { rawBody?: Buffer }).rawBody = buf;
    },
  })
);

app.get('/health', (_req, res) => {
  res.json({ status: 'healthy' });
});

// Register webhook routes
app.use('/api/v1', webhookRoutes);

export default app;
