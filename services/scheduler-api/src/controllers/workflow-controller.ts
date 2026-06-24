import type { Request, Response, NextFunction } from 'express';
import { validateDAG } from '@task-orchestrator/shared';
import type { TriggerConfig } from '@task-orchestrator/shared';
import { WorkflowRepository } from '../repositories/workflow-repository.js';
import { createError } from '../middleware/error-handler.js';

const workflowRepo = new WorkflowRepository();

function validateWorkflowBody(body: unknown): { valid: true; data: { name: string; description?: string; taskDefinitions: Array<{ name: string; type: string; config: Record<string, unknown>; timeoutMs: number; retryPolicy?: { strategy: 'fixed' | 'exponential' | 'linear'; maxAttempts: number; baseDelay: number } }>; edges: Array<{ sourceTaskId: string; targetTaskId: string; conditionExpr?: string }>; triggerConfig: TriggerConfig } } | { valid: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Request body must be a JSON object' };
  }

  const b = body as Record<string, unknown>;

  if (!b.name || typeof b.name !== 'string' || b.name.trim().length === 0) {
    return { valid: false, error: 'name is required and must be a non-empty string' };
  }

  if (!Array.isArray(b.taskDefinitions) || b.taskDefinitions.length === 0) {
    return { valid: false, error: 'taskDefinitions is required and must be a non-empty array' };
  }

  for (const task of b.taskDefinitions) {
    if (!task || typeof task !== 'object') {
      return { valid: false, error: 'Each taskDefinition must be an object' };
    }
    if (!task.name || typeof task.name !== 'string') {
      return { valid: false, error: 'Each taskDefinition must have a name' };
    }
    if (!task.type || typeof task.type !== 'string') {
      return { valid: false, error: 'Each taskDefinition must have a type' };
    }
    if (task.timeoutMs !== undefined && (typeof task.timeoutMs !== 'number' || task.timeoutMs <= 0)) {
      return { valid: false, error: 'taskDefinition timeoutMs must be a positive number' };
    }
  }

  if (!Array.isArray(b.edges)) {
    return { valid: false, error: 'edges must be an array' };
  }

  if (!b.triggerConfig || typeof b.triggerConfig !== 'object') {
    return { valid: false, error: 'triggerConfig is required' };
  }

  const tc = b.triggerConfig as Record<string, unknown>;
  const validTypes = ['manual', 'schedule', 'webhook', 'event'];
  if (!tc.type || !validTypes.includes(tc.type as string)) {
    return { valid: false, error: `triggerConfig.type must be one of: ${validTypes.join(', ')}` };
  }

  return {
    valid: true,
    data: {
      name: b.name as string,
      description: b.description as string | undefined,
      taskDefinitions: (b.taskDefinitions as Array<Record<string, unknown>>).map(t => ({
        name: t.name as string,
        type: t.type as string,
        config: (t.config as Record<string, unknown>) || {},
        timeoutMs: (t.timeoutMs as number) || 300000,
        retryPolicy: t.retryPolicy as { strategy: 'fixed' | 'exponential' | 'linear'; maxAttempts: number; baseDelay: number } | undefined,
      })),
      edges: (b.edges as Array<Record<string, unknown>>).map(e => ({
        sourceTaskId: e.sourceTaskId as string,
        targetTaskId: e.targetTaskId as string,
        conditionExpr: e.conditionExpr as string | undefined,
      })),
      triggerConfig: b.triggerConfig as TriggerConfig,
    },
  };
}

export async function createWorkflow(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const validation = validateWorkflowBody(req.body);
    if (!validation.valid) {
      throw createError(400, 'VALIDATION_ERROR', validation.error);
    }

    const { data } = validation;

    // Run DAG validation using temporary IDs for task definitions
    const tempTasks = data.taskDefinitions.map((t, i) => ({
      id: t.name, // use name as temp ID for DAG validation
      workflowId: 'temp',
      name: t.name,
      type: t.type,
      config: t.config,
      timeoutMs: t.timeoutMs,
      retryPolicy: t.retryPolicy,
    }));

    const tempEdges = data.edges.map((e, i) => ({
      id: `edge-${i}`,
      workflowId: 'temp',
      sourceTaskId: e.sourceTaskId,
      targetTaskId: e.targetTaskId,
      conditionExpr: e.conditionExpr,
    }));

    const dagResult = validateDAG(tempTasks, tempEdges);
    if (!dagResult.valid) {
      throw createError(400, 'DAG_VALIDATION_ERROR', 'Workflow graph is not a valid DAG', dagResult.errors);
    }

    const workflow = await workflowRepo.create({
      name: data.name,
      description: data.description,
      taskDefinitions: tempTasks,
      edges: tempEdges,
      triggerConfig: data.triggerConfig,
    });

    res.status(201).json(workflow);
  } catch (error) {
    next(error);
  }
}

export async function listWorkflows(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string, 10) || 20));

    const result = await workflowRepo.findAll(page, pageSize);

    res.status(200).json({
      workflows: result.workflows,
      total: result.total,
      page,
      pageSize,
    });
  } catch (error) {
    next(error);
  }
}

export async function getWorkflow(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const workflow = await workflowRepo.findById(id);

    if (!workflow) {
      throw createError(404, 'NOT_FOUND', `Workflow ${id} not found`);
    }

    res.status(200).json(workflow);
  } catch (error) {
    next(error);
  }
}

export async function updateWorkflow(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const validation = validateWorkflowBody(req.body);
    if (!validation.valid) {
      throw createError(400, 'VALIDATION_ERROR', validation.error);
    }

    const { data } = validation;

    // Run DAG validation
    const tempTasks = data.taskDefinitions.map((t, i) => ({
      id: t.name,
      workflowId: id,
      name: t.name,
      type: t.type,
      config: t.config,
      timeoutMs: t.timeoutMs,
      retryPolicy: t.retryPolicy,
    }));

    const tempEdges = data.edges.map((e, i) => ({
      id: `edge-${i}`,
      workflowId: id,
      sourceTaskId: e.sourceTaskId,
      targetTaskId: e.targetTaskId,
      conditionExpr: e.conditionExpr,
    }));

    const dagResult = validateDAG(tempTasks, tempEdges);
    if (!dagResult.valid) {
      throw createError(400, 'DAG_VALIDATION_ERROR', 'Workflow graph is not a valid DAG', dagResult.errors);
    }

    const workflow = await workflowRepo.update(id, {
      name: data.name,
      description: data.description,
      taskDefinitions: tempTasks,
      edges: tempEdges,
      triggerConfig: data.triggerConfig,
    });

    if (!workflow) {
      throw createError(404, 'NOT_FOUND', `Workflow ${id} not found`);
    }

    res.status(200).json(workflow);
  } catch (error) {
    next(error);
  }
}

export async function deleteWorkflow(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;

    const hasActive = await workflowRepo.hasActiveExecutions(id);
    if (hasActive) {
      throw createError(409, 'CONFLICT', 'Cannot delete workflow with active executions');
    }

    const deleted = await workflowRepo.delete(id);
    if (!deleted) {
      throw createError(404, 'NOT_FOUND', `Workflow ${id} not found`);
    }

    res.status(204).send();
  } catch (error) {
    next(error);
  }
}
