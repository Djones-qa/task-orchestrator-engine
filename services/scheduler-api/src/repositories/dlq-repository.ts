import { getPool } from '@task-orchestrator/shared';

export interface DeadLetterEntry {
  id: string;
  taskStateId: string;
  executionId: string;
  error: string | null;
  attempts: number;
  createdAt: Date;
}

export class DlqRepository {
  async insert(
    taskStateId: string,
    executionId: string,
    error: string | null,
    attempts: number
  ): Promise<DeadLetterEntry> {
    const pool = getPool();
    const result = await pool.query(
      `INSERT INTO dead_letter_queue (task_state_id, execution_id, error, attempts)
       VALUES ($1, $2, $3, $4)
       RETURNING id, task_state_id, execution_id, error, attempts, created_at`,
      [taskStateId, executionId, error, attempts]
    );

    const row = result.rows[0];
    return {
      id: row.id,
      taskStateId: row.task_state_id,
      executionId: row.execution_id,
      error: row.error || null,
      attempts: row.attempts,
      createdAt: row.created_at,
    };
  }

  async findAll(page: number = 1, pageSize: number = 20): Promise<{ entries: DeadLetterEntry[]; total: number }> {
    const pool = getPool();
    const limit = Math.min(pageSize, 100);
    const offset = (page - 1) * limit;

    const countResult = await pool.query('SELECT COUNT(*) FROM dead_letter_queue');
    const total = parseInt(countResult.rows[0].count, 10);

    const result = await pool.query(
      `SELECT id, task_state_id, execution_id, error, attempts, created_at
       FROM dead_letter_queue ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    const entries: DeadLetterEntry[] = result.rows.map((row) => ({
      id: row.id,
      taskStateId: row.task_state_id,
      executionId: row.execution_id,
      error: row.error || null,
      attempts: row.attempts,
      createdAt: row.created_at,
    }));

    return { entries, total };
  }
}
