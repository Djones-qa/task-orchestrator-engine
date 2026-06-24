import { getPool } from '@task-orchestrator/shared';
import type { TaskState, TaskStatus, TaskDefinition } from '@task-orchestrator/shared';

export class TaskStateRepository {
  async createBatch(executionId: string, taskDefinitions: TaskDefinition[]): Promise<TaskState[]> {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const taskStates: TaskState[] = [];

      for (const taskDef of taskDefinitions) {
        const result = await client.query(
          `INSERT INTO task_states (execution_id, task_definition_id, status, attempt_count)
           VALUES ($1, $2, 'pending', 0)
           RETURNING id, execution_id, task_definition_id, status, attempt_count, output, error, started_at, completed_at`,
          [executionId, taskDef.id]
        );

        const row = result.rows[0];
        taskStates.push({
          id: row.id,
          executionId: row.execution_id,
          taskDefinitionId: row.task_definition_id,
          status: row.status as TaskStatus,
          attemptCount: row.attempt_count,
          output: row.output || undefined,
          error: row.error || undefined,
          startedAt: row.started_at || undefined,
          completedAt: row.completed_at || undefined,
        });
      }

      await client.query('COMMIT');
      return taskStates;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async findByExecutionId(executionId: string): Promise<TaskState[]> {
    const pool = getPool();

    const result = await pool.query(
      `SELECT id, execution_id, task_definition_id, status, attempt_count, output, error, started_at, completed_at
       FROM task_states WHERE execution_id = $1`,
      [executionId]
    );

    return result.rows.map((row) => ({
      id: row.id,
      executionId: row.execution_id,
      taskDefinitionId: row.task_definition_id,
      status: row.status as TaskStatus,
      attemptCount: row.attempt_count,
      output: row.output || undefined,
      error: row.error || undefined,
      startedAt: row.started_at || undefined,
      completedAt: row.completed_at || undefined,
    }));
  }

  async updateStatus(
    id: string,
    status: TaskStatus,
    output?: Record<string, unknown>,
    error?: string
  ): Promise<boolean> {
    const pool = getPool();

    let query: string;
    let params: unknown[];

    if (status === 'running') {
      query = `UPDATE task_states SET status = $1, started_at = NOW(), attempt_count = attempt_count + 1
               WHERE id = $2`;
      params = [status, id];
    } else if (status === 'completed') {
      query = `UPDATE task_states SET status = $1, output = $2, completed_at = NOW()
               WHERE id = $3`;
      params = [status, output ? JSON.stringify(output) : null, id];
    } else if (status === 'failed' || status === 'timed_out') {
      query = `UPDATE task_states SET status = $1, error = $2, completed_at = NOW()
               WHERE id = $3`;
      params = [status, error || null, id];
    } else {
      query = `UPDATE task_states SET status = $1 WHERE id = $2`;
      params = [status, id];
    }

    const result = await pool.query(query, params);
    return (result.rowCount ?? 0) > 0;
  }

  async createAuditEntry(
    taskStateId: string,
    previousState: TaskStatus,
    newState: TaskStatus
  ): Promise<void> {
    const pool = getPool();
    await pool.query(
      `INSERT INTO task_state_audit (task_state_id, previous_state, new_state)
       VALUES ($1, $2, $3)`,
      [taskStateId, previousState, newState]
    );
  }
}
