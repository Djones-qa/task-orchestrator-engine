import { Router } from 'express';
import { MetricsController } from '../controllers/metrics-controller.js';

export function createMonitorRoutes(controller: MetricsController): Router {
  const router = Router();

  router.get('/metrics', (req, res, next) => controller.getExecutionMetrics(req, res, next));
  router.get('/executors/health', (req, res, next) => controller.getExecutorHealth(req, res, next));
  router.get('/alerts', (req, res, next) => controller.getAlerts(req, res, next));

  return router;
}
