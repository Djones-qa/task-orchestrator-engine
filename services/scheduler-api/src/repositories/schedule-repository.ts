import { getPool } from '@task-orchestrator/shared';
import type { Schedule } from '@task-orchestrator/shared';

export class ScheduleRepository {
  async create(schedule: Omit<Schedule, 'id' | 'createdAt'>): Promise<Schedule> {
    const pool = getPool();
    const result = await pool.query(
      `INSERT INTO schedules (workflow_id, cron_expr, interval_ms, timezone, active, last_run_at, next_run_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, workflow_id, cron_expr, interval_ms, timezone, active, last_run_at, next_run_at, created_at`,
      [
        schedule.workflowId,
        schedule.cronExpr || null,
        schedule.intervalMs || null,
        schedule.timezone,
        schedule.active,
        schedule.lastRunAt || null,
        schedule.nextRunAt || null,
      ]
    );

    const row = result.rows[0];
    return this.mapRow(row);
  }

  async findById(id: string): Promise<Schedule | null> {
    const pool = getPool();
    const result = await pool.query(
      `SELECT id, workflow_id, cron_expr, interval_ms, timezone, active, last_run_at, next_run_at, created_at
       FROM schedules WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRow(result.rows[0]);
  }

  async findAll(page: number = 1, pageSize: number = 20): Promise<{ schedules: Schedule[]; total: number }> {
    const pool = getPool();
    const limit = Math.min(pageSize, 100);
    const offset = (page - 1) * limit;

    const countResult = await pool.query('SELECT COUNT(*) FROM schedules');
    const total = parseInt(countResult.rows[0].count, 10);

    const result = await pool.query(
      `SELECT id, workflow_id, cron_expr, interval_ms, timezone, active, last_run_at, next_run_at, created_at
       FROM schedules ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    return {
      schedules: result.rows.map((row) => this.mapRow(row)),
      total,
    };
  }

  async findActive(): Promise<Schedule[]> {
    const pool = getPool();
    const result = await pool.query(
      `SELECT id, workflow_id, cron_expr, interval_ms, timezone, active, last_run_at, next_run_at, created_at
       FROM schedules WHERE active = TRUE`
    );

    return result.rows.map((row) => this.mapRow(row));
  }

  async findDue(now: Date): Promise<Schedule[]> {
    const pool = getPool();
    const result = await pool.query(
      `SELECT id, workflow_id, cron_expr, interval_ms, timezone, active, last_run_at, next_run_at, created_at
       FROM schedules WHERE active = TRUE AND next_run_at <= $1`,
      [now]
    );

    return result.rows.map((row) => this.mapRow(row));
  }

  async updateNextRun(id: string, nextRunAt: Date, lastRunAt: Date): Promise<boolean> {
    const pool = getPool();
    const result = await pool.query(
      `UPDATE schedules SET next_run_at = $1, last_run_at = $2 WHERE id = $3`,
      [nextRunAt, lastRunAt, id]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async setActive(id: string, active: boolean): Promise<boolean> {
    const pool = getPool();
    const result = await pool.query(
      `UPDATE schedules SET active = $1 WHERE id = $2`,
      [active, id]
    );
    return (result.rowCount ?? 0) > 0;
  }

  private mapRow(row: Record<string, unknown>): Schedule {
    return {
      id: row.id as string,
      workflowId: row.workflow_id as string,
      cronExpr: (row.cron_expr as string) || undefined,
      intervalMs: (row.interval_ms as number) || undefined,
      timezone: row.timezone as string,
      active: row.active as boolean,
      lastRunAt: row.last_run_at ? new Date(row.last_run_at as string) : undefined,
      nextRunAt: row.next_run_at ? new Date(row.next_run_at as string) : undefined,
      createdAt: new Date(row.created_at as string),
    };
  }
}
