import { Pool } from 'pg';
import {
  transition,
  calculateRetryDelay,
  shouldRetry,
  LockManager,
  type TaskDefinition,
  type TaskState,
  type TaskStatus,
} from '@task-orchestrator/shared';
import type { TaskClaimer } from './task-claimer.js';

export interface RetryHandlerDeps {
  pool: Pool;
  lockManager: LockManager;
  claimer: TaskClaimer;
  executorId: string;
}

/**
 * Handles task failure with retry logic.
 * - With RetryPolicy: calculates delay, waits, re-executes.
 * - Maintains lock during retry delay (keeps renewing).
 * - On exhausting attempts: inserts into DLQ, transitions to failed.
 * - No RetryPolicy: transitions to failed immediately.
 */
export class RetryHandler {
  private readonly pool: Pool;
  private readonly lockManager: LockManager;
  private readonly claimer: TaskClaimer;
  private readonly executorId: string;

  constructor(deps: RetryHandlerDeps) {
    this.pool = deps.pool;
    this.lockManager = deps.lockManager;
    this.claimer = deps.claimer;
    this.executorId = deps.executorId;
  }

  /** Handle a task failure — either retry or transition to failed */
  async handleFailure(
    taskState: TaskState,
    taskDefinition: TaskDefinition,
    error?: string,
  ): Promise<void> {
    const retryPolicy = taskDefinition.retryPolicy;

    if (!retryPolicy) {
      // No retry policy: transition to failed immediately
      await this.transitionToFailed(taskState, error);
      await this.claimer.releaseCurrentTask();
      return;
    }

    const currentAttempt = taskState.attemptCount + 1;

    // Update attempt count
    await this.pool.query(
      'UPDATE task_states SET attempt_count = $2 WHERE id = $1',
      [taskState.id, currentAttempt],
    );

    if (!shouldRetry(retryPolicy, currentAttempt)) {
      // Exhausted all retry attempts: insert into DLQ and transition to failed
      await this.insertIntoDLQ(taskState, error, currentAttempt);
      await this.transitionToFailed(taskState, error);
      await this.claimer.releaseCurrentTask();
      return;
    }

    // Calculate retry delay and wait (lock is maintained during this period)
    const delayMs = calculateRetryDelay(retryPolicy, currentAttempt);
    await this.waitWithLockRenewal(taskState.id, delayMs);

    // Check if lock was lost during wait
    if (this.claimer.isCurrentTaskAborted()) {
      this.claimer.clearCurrentTask();
      return;
    }

    // Re-execute: transition back to pending and re-enqueue
    // The task will be picked up again by the claimer
    await this.pool.query(
      `UPDATE task_states SET status = 'pending', error = $2 WHERE id = $1`,
      [taskState.id, error],
    );
    await this.claimer.releaseCurrentTask();

    // Re-enqueue the task for execution
    const { TaskQueue } = await import('@task-orchestrator/shared');
    const { getRedisClient } = await import('@task-orchestrator/shared');
    const redis = getRedisClient();
    const queue = new TaskQueue(redis);
    await queue.enqueue(taskState.id);
  }

  private async waitWithLockRenewal(taskStateId: string, delayMs: number): Promise<void> {
    const startTime = Date.now();
    const renewalInterval = 10000; // Renew every 10 seconds

    while (Date.now() - startTime < delayMs) {
      if (this.claimer.isCurrentTaskAborted()) {
        return;
      }

      const waitTime = Math.min(renewalInterval, delayMs - (Date.now() - startTime));
      await new Promise((resolve) => setTimeout(resolve, waitTime));

      // Renew lock during retry delay
      if (Date.now() - startTime < delayMs) {
        const renewed = await this.lockManager.renew(taskStateId, this.executorId);
        if (!renewed) {
          // Lock lost during retry wait
          return;
        }
      }
    }
  }

  private async transitionToFailed(taskState: TaskState, error?: string): Promise<void> {
    const result = transition('running', 'failed', taskState.id);
    if (result.success) {
      await this.updateTaskState(taskState.id, 'failed', error);
    }
  }

  private async insertIntoDLQ(
    taskState: TaskState,
    error?: string,
    attempts?: number,
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO dead_letter_queue (task_state_id, execution_id, error, attempts)
       VALUES ($1, $2, $3, $4)`,
      [taskState.id, taskState.executionId, error || 'Unknown error', attempts || 0],
    );
  }

  private async updateTaskState(
    taskStateId: string,
    status: TaskStatus,
    error?: string,
  ): Promise<void> {
    const now = new Date();
    const params: unknown[] = [taskStateId, status, now];
    let query = 'UPDATE task_states SET status = $2, completed_at = $3';

    if (error !== undefined) {
      query += ', error = $4';
      params.push(error);
    }

    query += ' WHERE id = $1';
    await this.pool.query(query, params);
  }
}
