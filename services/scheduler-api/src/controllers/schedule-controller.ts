import { Request, Response, NextFunction } from 'express';
import { ScheduleRepository } from '../repositories/schedule-repository.js';
import { WorkflowRepository } from '../repositories/workflow-repository.js';
import { parseCronExpression, getNextRunTime } from '@task-orchestrator/shared';

export class ScheduleController {
  constructor(
    private scheduleRepo: ScheduleRepository,
    private workflowRepo: WorkflowRepository
  ) {}

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { workflowId, cronExpr, intervalMs, timezone } = req.body;
      
      const workflow = await this.workflowRepo.findById(workflowId);
      if (!workflow) {
        res.status(422).json({ error: { code: 'UNPROCESSABLE_ENTITY', message: 'Workflow not found', details: { field: 'workflowId' } } });
        return;
      }

      if (cronExpr) {
        try { parseCronExpression(cronExpr); }
        catch { res.status(422).json({ error: { code: 'UNPROCESSABLE_ENTITY', message: 'Invalid cron expression', details: { field: 'cronExpr' } } }); return; }
      }

      if (intervalMs !== undefined && (intervalMs < 1000 || intervalMs > 86400000)) {
        res.status(422).json({ error: { code: 'UNPROCESSABLE_ENTITY', message: 'Interval must be between 1000 and 86400000 ms', details: { field: 'intervalMs' } } });
        return;
      }

      let nextRunAt: Date | undefined;
      if (cronExpr) {
        const nextMs = getNextRunTime(cronExpr, Date.now(), timezone || 'UTC');
        nextRunAt = new Date(nextMs);
      } else if (intervalMs) {
        nextRunAt = new Date(Date.now() + intervalMs);
      }

      const schedule = await this.scheduleRepo.create({ workflowId, cronExpr, intervalMs, timezone: timezone || 'UTC', active: true, nextRunAt });
      res.status(201).json(schedule);
    } catch (err) {
      next(err);
    }
  }

  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string) || 50));
      const schedules = await this.scheduleRepo.findAll(page, pageSize);
      res.status(200).json(schedules);
    } catch (err) {
      next(err);
    }
  }

  async toggle(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { active } = req.body;
      const schedule = await this.scheduleRepo.updateActive(id, active);
      if (!schedule) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: `Schedule ${id} not found` } });
        return;
      }
      res.status(200).json(schedule);
    } catch (err) {
      next(err);
    }
  }
}
