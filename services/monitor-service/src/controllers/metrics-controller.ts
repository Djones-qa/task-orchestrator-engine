import type { Request, Response, NextFunction } from 'express';
import { MetricsAggregator } from '../services/metrics-aggregator.js';
import { ExecutorHealthTracker } from '../services/executor-health-tracker.js';
import * as alertRepository from '../repositories/alert-repository.js';

export class MetricsController {
  constructor(
    private metricsAggregator: MetricsAggregator,
    private healthTracker: ExecutorHealthTracker,
  ) {}

  async getExecutionMetrics(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const metrics = await this.metricsAggregator.getMetrics();
      res.status(200).json(metrics);
    } catch (error) {
      next(error);
    }
  }

  async getExecutorHealth(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const health = await this.healthTracker.getAllExecutorHealth();
      res.status(200).json({ executors: health });
    } catch (error) {
      next(error);
    }
  }

  async getAlerts(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const hours = Math.min(168, Math.max(1, parseInt(req.query.hours as string, 10) || 24));
      const limit = Math.min(500, Math.max(1, parseInt(req.query.limit as string, 10) || 200));
      const alerts = await alertRepository.findRecent(hours, limit);
      res.status(200).json({ alerts, total: alerts.length });
    } catch (error) {
      next(error);
    }
  }
}
