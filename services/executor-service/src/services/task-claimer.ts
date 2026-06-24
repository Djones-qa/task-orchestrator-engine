import { TaskQueue, LockManager } from '@task-orchestrator/shared';

export interface TaskClaimerOptions {
  executorId: string;
  taskQueue: TaskQueue;
  lockManager: LockManager;
  lockTtlMs?: number;
  lockRenewalIntervalMs?: number;
  claimTimeoutSeconds?: number;
}

export interface ClaimedTask {
  taskStateId: string;
  renewalInterval: NodeJS.Timeout;
  aborted: boolean;
}

/**
 * Polls the task queue to claim tasks, acquires distributed locks,
 * and manages lock renewal intervals.
 */
export class TaskClaimer {
  private running = false;
  private currentTask: ClaimedTask | null = null;
  private readonly executorId: string;
  private readonly taskQueue: TaskQueue;
  private readonly lockManager: LockManager;
  private readonly lockTtlMs: number;
  private readonly lockRenewalIntervalMs: number;
  private readonly claimTimeoutSeconds: number;

  constructor(options: TaskClaimerOptions) {
    this.executorId = options.executorId;
    this.taskQueue = options.taskQueue;
    this.lockManager = options.lockManager;
    this.lockTtlMs = options.lockTtlMs ?? 30000;
    this.lockRenewalIntervalMs = options.lockRenewalIntervalMs ?? 10000;
    this.claimTimeoutSeconds = options.claimTimeoutSeconds ?? 5;
  }

  /** Start the polling loop. Resolves when stop() is called. */
  async start(onTaskClaimed: (taskStateId: string, claimer: TaskClaimer) => Promise<void>): Promise<void> {
    this.running = true;

    while (this.running) {
      // Only claim when no task is active
      if (this.currentTask) {
        await this.sleep(1000);
        continue;
      }

      try {
        const taskStateId = await this.taskQueue.claim(this.claimTimeoutSeconds);

        if (!taskStateId) {
          // No task available, loop will retry
          continue;
        }

        // Attempt to acquire the distributed lock
        const lockAcquired = await this.lockManager.acquire(
          taskStateId,
          this.executorId,
          this.lockTtlMs,
        );

        if (!lockAcquired) {
          // Lock failure: re-enqueue and retry claim
          await this.taskQueue.requeue(taskStateId);
          continue;
        }

        // Start lock renewal interval
        const claimedTask: ClaimedTask = {
          taskStateId,
          aborted: false,
          renewalInterval: setInterval(async () => {
            try {
              const renewed = await this.lockManager.renew(
                taskStateId,
                this.executorId,
                this.lockTtlMs,
              );
              if (!renewed) {
                // Lock renewal failed — abort task, don't persist partial results
                claimedTask.aborted = true;
                clearInterval(claimedTask.renewalInterval);
              }
            } catch {
              claimedTask.aborted = true;
              clearInterval(claimedTask.renewalInterval);
            }
          }, this.lockRenewalIntervalMs),
        };

        this.currentTask = claimedTask;

        // Execute the callback with the claimed task
        await onTaskClaimed(taskStateId, this);
      } catch (error) {
        // Log and continue polling
        console.error('[TaskClaimer] Error during claim loop:', error);
        await this.sleep(1000);
      }
    }
  }

  /** Mark the current task as complete and release it */
  async releaseCurrentTask(): Promise<void> {
    if (!this.currentTask) return;

    clearInterval(this.currentTask.renewalInterval);
    await this.lockManager.release(this.currentTask.taskStateId, this.executorId);
    await this.taskQueue.removeFromProcessing(this.currentTask.taskStateId);
    this.currentTask = null;
  }

  /** Release the lock without removing from processing (for requeue scenarios) */
  async releaseLock(taskStateId: string): Promise<void> {
    await this.lockManager.release(taskStateId, this.executorId);
  }

  /** Check if the current task has been aborted due to lock renewal failure */
  isCurrentTaskAborted(): boolean {
    return this.currentTask?.aborted ?? false;
  }

  /** Get the currently claimed task state ID */
  getCurrentTaskId(): string | null {
    return this.currentTask?.taskStateId ?? null;
  }

  /** Check if the claimer has an active task */
  hasActiveTask(): boolean {
    return this.currentTask !== null;
  }

  /** Clear current task reference (used after handling abort) */
  clearCurrentTask(): void {
    if (this.currentTask) {
      clearInterval(this.currentTask.renewalInterval);
      this.currentTask = null;
    }
  }

  /** Stop the polling loop */
  stop(): void {
    this.running = false;
    if (this.currentTask) {
      clearInterval(this.currentTask.renewalInterval);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
