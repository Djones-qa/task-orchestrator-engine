import { getPool, TaskQueue, LockManager } from '@task-orchestrator/shared';

export class OrphanDetector {
  private intervalHandle: NodeJS.Timeout | null = null;
  private readonly lockTtlMs = 30000;

  constructor(
    private taskQueue: TaskQueue,
    private lockManager: LockManager
  ) {}

  start(): void {
    this.intervalHandle = setInterval(() => {
      this.detect().catch((err) => {
        console.error('[OrphanDetector] Detection error:', err);
      });
    }, 60000);
  }

  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  private async detect(): Promise<void> {
    // Acquire a distributed lock to prevent multiple instances running detection
    const lock = await this.lockManager.acquire('orphan-detector', this.lockTtlMs);
    if (!lock) return;

    try {
      const pool = getPool();

      // Find task states that are 'processing' but their lock has expired
      // This indicates the executor holding them has likely crashed
      const result = await pool.query(
        `SELECT ts.id, ts.execution_id
         FROM task_states ts
         WHERE ts.status = 'processing'
           AND ts.claimed_at < NOW() - INTERVAL '5 minutes'`
      );

      for (const orphan of result.rows) {
        try {
          // Reset status to pending and re-enqueue
          await pool.query(
            `UPDATE task_states SET status = 'pending', claimed_at = NULL, attempts = attempts + 1
             WHERE id = $1 AND status = 'processing'`,
            [orphan.id]
          );

          await this.taskQueue.enqueue(orphan.id);
          console.log(`[OrphanDetector] Re-enqueued orphaned task state ${orphan.id}`);
        } catch (err) {
          console.error(`[OrphanDetector] Failed to re-enqueue task ${orphan.id}:`, err);
        }
      }
    } finally {
      await this.lockManager.release('orphan-detector', lock);
    }
  }
}
