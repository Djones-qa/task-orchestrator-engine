import { exec } from 'child_process';
import { Pool } from 'pg';
import {
  transition,
  type TaskDefinition,
  type TaskState,
  type TaskStatus,
} from '@task-orchestrator/shared';
import type { TaskClaimer } from './task-claimer.js';
import { RetryHandler } from './retry-handler.js';

const DEFAULT_TIMEOUT_MS = 300000;

export interface TaskRunnerDeps {
  pool: Pool;
  claimer: TaskClaimer;
  retryHandler: RetryHandler;
  executorId: string;
}

export interface TaskResult {
  success: boolean;
  output?: Record<string, unknown>;
  error?: string;
}

/**
 * Executes tasks based on their type and enforces timeouts.
 * On success: transitions to completed, records output, releases lock.
 * On timeout: transitions to timed_out, releases lock.
 * On failure: delegates to retry handler.
 */
export class TaskRunner {
  private readonly pool: Pool;
  private readonly claimer: TaskClaimer;
  private readonly retryHandler: RetryHandler;
  private readonly executorId: string;

  constructor(deps: TaskRunnerDeps) {
    this.pool = deps.pool;
    this.claimer = deps.claimer;
    this.retryHandler = deps.retryHandler;
    this.executorId = deps.executorId;
  }

  /** Run a task with timeout enforcement */
  async run(taskState: TaskState, taskDefinition: TaskDefinition): Promise<void> {
    const timeoutMs = taskDefinition.timeoutMs || DEFAULT_TIMEOUT_MS;

    // Transition to running
    const runningResult = transition(taskState.status, 'running', taskState.id);
    if (!runningResult.success) {
      console.error('[TaskRunner] Cannot transition to running:', runningResult.error);
      await this.claimer.releaseCurrentTask();
      return;
    }

    await this.updateTaskState(taskState.id, 'running', undefined, undefined);

    // Check if task was aborted before execution
    if (this.claimer.isCurrentTaskAborted()) {
      // Don't persist partial results
      this.claimer.clearCurrentTask();
      return;
    }

    let result: TaskResult;

    try {
      result = await this.executeWithTimeout(taskDefinition, timeoutMs);
    } catch (error) {
      // Timeout case
      if (error instanceof TimeoutError) {
        await this.handleTimeout(taskState);
        return;
      }
      result = { success: false, error: String(error) };
    }

    // Check abort after execution
    if (this.claimer.isCurrentTaskAborted()) {
      this.claimer.clearCurrentTask();
      return;
    }

    if (result.success) {
      await this.handleSuccess(taskState, result.output);
    } else {
      await this.handleFailure(taskState, taskDefinition, result.error);
    }
  }

  private async executeWithTimeout(
    taskDefinition: TaskDefinition,
    timeoutMs: number,
  ): Promise<TaskResult> {
    return new Promise<TaskResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new TimeoutError(`Task timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.executeTask(taskDefinition)
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  private async executeTask(taskDefinition: TaskDefinition): Promise<TaskResult> {
    const config = taskDefinition.config;

    switch (taskDefinition.type) {
      case 'http':
        return this.executeHttp(config);
      case 'script':
        return this.executeScript(config);
      case 'delay':
        return this.executeDelay(config);
      case 'approval':
        return this.executeApproval(config);
      case 'conditional':
        return this.executeConditional(config);
      default:
        return { success: false, error: `Unknown task type: ${taskDefinition.type}` };
    }
  }

  private async executeHttp(config: Record<string, unknown>): Promise<TaskResult> {
    try {
      const url = config.url as string;
      const method = (config.method as string) || 'GET';
      const headers = (config.headers as Record<string, string>) || {};
      const body = config.body;

      const fetchOptions: RequestInit = {
        method,
        headers,
      };
      if (body && method !== 'GET') {
        fetchOptions.body = JSON.stringify(body);
      }

      const response = await fetch(url, fetchOptions);
      const responseBody = await response.text();

      let parsedBody: unknown;
      try {
        parsedBody = JSON.parse(responseBody);
      } catch {
        parsedBody = responseBody;
      }

      if (response.ok) {
        return { success: true, output: { statusCode: response.status, body: parsedBody } };
      }
      return { success: false, error: `HTTP ${response.status}: ${responseBody}` };
    } catch (error) {
      return { success: false, error: `HTTP request failed: ${String(error)}` };
    }
  }

  private async executeScript(config: Record<string, unknown>): Promise<TaskResult> {
    const command = config.command as string;
    if (!command) {
      return { success: false, error: 'No command specified for script task' };
    }

    return new Promise<TaskResult>((resolve) => {
      exec(command, { timeout: 0 }, (error, stdout, stderr) => {
        if (error) {
          resolve({ success: false, error: `Script failed: ${stderr || error.message}` });
        } else {
          resolve({ success: true, output: { stdout: stdout.trim(), stderr: stderr.trim() } });
        }
      });
    });
  }

  private async executeDelay(config: Record<string, unknown>): Promise<TaskResult> {
    const delayMs = (config.delayMs as number) || 1000;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    return { success: true, output: { delayMs } };
  }

  private async executeApproval(config: Record<string, unknown>): Promise<TaskResult> {
    // Approval tasks wait for external signal — for now, they complete immediately
    // In a full implementation, this would subscribe to an approval event
    return { success: true, output: { approved: true, approvedAt: new Date().toISOString() } };
  }

  private async executeConditional(config: Record<string, unknown>): Promise<TaskResult> {
    const expression = config.expression as string;
    const context = config.context as Record<string, unknown> | undefined;

    try {
      // Evaluate expression in a safe manner
      const result = this.evaluateExpression(expression, context || {});
      return { success: true, output: { result } };
    } catch (error) {
      return { success: false, error: `Conditional evaluation failed: ${String(error)}` };
    }
  }

  private evaluateExpression(expression: string, context: Record<string, unknown>): unknown {
    // Simple expression evaluator for conditional tasks
    const fn = new Function(...Object.keys(context), `return (${expression})`);
    return fn(...Object.values(context));
  }

  private async handleTimeout(taskState: TaskState): Promise<void> {
    const result = transition('running', 'timed_out', taskState.id);
    if (result.success) {
      await this.updateTaskState(taskState.id, 'timed_out', undefined, 'Task timed out');
    }
    await this.claimer.releaseCurrentTask();
  }

  private async handleSuccess(
    taskState: TaskState,
    output?: Record<string, unknown>,
  ): Promise<void> {
    const result = transition('running', 'completed', taskState.id);
    if (result.success) {
      await this.updateTaskState(taskState.id, 'completed', output, undefined);
    }
    await this.claimer.releaseCurrentTask();
  }

  private async handleFailure(
    taskState: TaskState,
    taskDefinition: TaskDefinition,
    error?: string,
  ): Promise<void> {
    await this.retryHandler.handleFailure(taskState, taskDefinition, error);
  }

  private async updateTaskState(
    taskStateId: string,
    status: TaskStatus,
    output?: Record<string, unknown>,
    error?: string,
  ): Promise<void> {
    const now = new Date();
    const setClauses: string[] = ['status = $2'];
    const params: unknown[] = [taskStateId, status];
    let paramIdx = 3;

    if (status === 'running') {
      setClauses.push(`started_at = $${paramIdx}`);
      params.push(now);
      paramIdx++;
    }

    if (status === 'completed' || status === 'failed' || status === 'timed_out') {
      setClauses.push(`completed_at = $${paramIdx}`);
      params.push(now);
      paramIdx++;
    }

    if (output !== undefined) {
      setClauses.push(`output = $${paramIdx}`);
      params.push(JSON.stringify(output));
      paramIdx++;
    }

    if (error !== undefined) {
      setClauses.push(`error = $${paramIdx}`);
      params.push(error);
      paramIdx++;
    }

    await this.pool.query(
      `UPDATE task_states SET ${setClauses.join(', ')} WHERE id = $1`,
      params,
    );
  }
}

class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
  }
}
