import { Router } from 'express';
import { ExecutionController } from '../controllers/execution-controller.js';

export function createExecutionRoutes(controller: ExecutionController): Router {
  const router = Router();
  router.post('/workflows/:id/execute', (req, res, next) => controller.execute(req, res, next));
  router.get('/executions/:id', (req, res, next) => controller.getById(req, res, next));
  router.post('/executions/:id/cancel', (req, res, next) => controller.cancel(req, res, next));
  return router;
}
