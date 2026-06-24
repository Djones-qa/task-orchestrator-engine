import { Router } from 'express';
import { payloadValidator } from '../middleware/payload-validator.js';
import { handleWebhook } from '../controllers/webhook-controller.js';

const router = Router();

// POST /api/v1/webhooks/:id — ingest a webhook
router.post('/webhooks/:id', payloadValidator, handleWebhook);

export default router;
