import { Request, Response, NextFunction } from 'express';
import { ExecutionRepository } from '../repositories/execution-repository.js';
import { TaskStateRepository } from '../repositories/task-state-repository.js';
import { WorkflowRepository } from '../repositories/workflow-repository.js';
import { TaskQueue } from '@task-orchestrator/shared';

export class ExecutionController {
  constructor(
    private executionRepo: ExecutionRepository,
    private taskStateRepo: TaskStateRepository,
    private workflowRepo: WorkflowRepository,
    private taskQueue: TaskQueue
  ) {}

  async execute(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const workflow = await this.workflowRepo.findById(id);
      if (!workflow) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: `Workflow ${id} not found` } });
        return;
      }

      const execution = await this.executionRepo.create(id, req.body?.input);
      const taskStates = await this.taskStateRepo.createBatch(execution.id, workflow.taskDefinitions);

      // Find root tasks (no incoming edges)
      const targetIds = new Set(workflow.edges.map(e => e.targetTaskId));
      const rootTasks = taskStates.filter(ts => !targetIds.has(ts.taskDefinitionId));

      // Enqueue root tasks
      for (const rootTask of rootTasks) {
        await this.taskQueue.enqueue(rootTask.id);
      }

      await this.executionRepo.updateStatus(execution.id, 'running', new Date());
      res.status(202).json({ id: execution.id, status: 'running' });
    } catch (error) {
      next(error);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const execution = await this.executionRepo.findById(id);
      if (!execution) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: `Execution ${id} not found` } });
        return;
      }
      res.status(200).json(execution);
    } catch (error) {
      next(error);
    }
  }

  async cancel(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const execution = await this.executionRepo.findById(id);
      if (!execution) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: `Execution ${id} not found` } });
        return;
      }

      const terminalStatuses = ['completed', 'failed', 'cancelled'];
      if (terminalStatuses.includes(execution.status)) {
        res.status(409).json({ error: { code: 'CONFLICT', message: `Execution ${id} is already in terminal state '${execution.status}'` } });
        return;
      }

      await this.executionRepo.updateStatus(id, 'cancelled', new Date());
      // Cancel all pending task states
      const taskStates = await this.taskStateRepo.findByExecutionId(id);
      for (const ts of taskStates) {
        if (ts.status === 'pending') {
          await this.taskStateRepo.updateStatus(ts.id, 'cancelled');
        }
      }

      res.status(200).json({ id, status: 'cancelled' });
    } catch (error) {
      next(error);
    }
  }
}
