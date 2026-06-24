import { getPool, getNextRunTime, TaskQueue } from '@task-orchestrator/shared';

export class ScheduleEvaluator {
  private intervalHandle: NodeJS.Timeout | null = null;

  constructor(private taskQueue: TaskQueue) {}

  start(): void {
    this.intervalHandle = setInterval(() => {
      this.evaluate().catch((err) => {
        console.error('[ScheduleEvaluator] Evaluation error:', err);
      });
    }, 5000);
  }

  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  private async evaluate(): Promise<void> {
    const pool = getPool();

    // Find schedules that are due
    const result = await pool.query(
      `SELECT id, workflow_id, cron_expr, interval_ms, timezone
       FROM schedules
       WHERE active = true AND next_run_at <= NOW()
       ORDER BY next_run_at ASC
       LIMIT 50`
    );

    for (const schedule of result.rows) {
      try {
        // Create an execution for the workflow
        const execResult = await pool.query(
          `INSERT INTO executions (workflow_id, status, started_at)
           VALUES ($1, 'pending', NOW())
           RETURNING id`,
          [schedule.workflow_id]
        );

        const executionId = execResult.rows[0].id;

        // Create task states for the execution
        const taskDefs = await pool.query(
          'SELECT id FROM task_definitions WHERE workflow_id = $1',
          [schedule.workflow_id]
        );

        for (const taskDef of taskDefs.rows) {
          const tsResult = await pool.query(
            `INSERT INTO task_states (execution_id, task_definition_id, status)
             VALUES ($1, $2, 'pending')
             RETURNING id`,
            [executionId, taskDef.id]
          );

          // Enqueue root tasks (simplified - enqueue all for now)
          await this.taskQueue.enqueue(tsResult.rows[0].id);
        }

        await pool.query(
          "UPDATE executions SET status = 'running' WHERE id = $1",
          [executionId]
        );

        // Update the next run time
        let nextRunAt: Date;
        if (schedule.cron_expr) {
          const nextMs = getNextRunTime(schedule.cron_expr, Date.now(), schedule.timezone);
          nextRunAt = new Date(nextMs);
        } else {
          nextRunAt = new Date(Date.now() + schedule.interval_ms);
        }

        await pool.query(
          'UPDATE schedules SET next_run_at = $1, last_run_at = NOW() WHERE id = $2',
          [nextRunAt, schedule.id]
        );
      } catch (err) {
        console.error(`[ScheduleEvaluator] Failed to process schedule ${schedule.id}:`, err);
      }
    }
  }
}
