import { getPool } from '@task-orchestrator/shared';
import type { Execution, ExecutionStatus, TaskState } from '@task-orchestrator/shared';

export class ExecutionRepository {
  async create(workflowId: string, input?: Record<string, unknown>): Promise<Execution> {
    const pool = getPool();
    const result = await pool.query(
      `INSERT INTO executions (workflow_id, status, input)
       VALUES ($1, 'pending', $2)
       RETURNING id, workflow_id, status, input, started_at, completed_at, created_at`,
      [workflowId, input ? JSON.stringify(input) : null]
    );

    const row = result.rows[0];
    return {
      id: row.id,
      workflowId: row.workflow_id,
      status: row.status,
      input: row.input || undefined,
      startedAt: row.started_at || undefined,
      completedAt: row.completed_at || undefined,
      createdAt: row.created_at,
    };
  }

  async findById(id: string): Promise<(Execution & { taskStates: TaskState[] }) | null> {
    const pool = getPool();

    const execResult = await pool.query(
      `SELECT id, workflow_id, status, input, started_at, completed_at, created_at
       FROM executions WHERE id = $1`,
      [id]
    );

    if (execResult.rows.length === 0) {
      return null;
    }

    const row = execResult.rows[0];

    const taskStatesResult = await pool.query(
      `SELECT id, execution_id, task_definition_id, status, attempt_count, output, error, started_at, completed_at
       FROM task_states WHERE execution_id = $1`,
      [id]
    );

    const taskStates: TaskState[] = taskStatesResult.rows.map(r => ({
      id: r.id,
      executionId: r.execution_id,
      taskDefinitionId: r.task_definition_id,
      status: r.status,
      attemptCount: r.attempt_count,
      output: r.output || undefined,
      error: r.error || undefined,
      startedAt: r.started_at || undefined,
      completedAt: r.completed_at || undefined,
    }));

    return {
      id: row.id,
      workflowId: row.workflow_id,
      status: row.status,
      input: row.input || undefined,
      startedAt: row.started_at || undefined,
      completedAt: row.completed_at || undefined,
      createdAt: row.created_at,
      taskStates,
    };
  }

  async updateStatus(id: string, status: ExecutionStatus, timestamp?: Date): Promise<boolean> {
    const pool = getPool();
    let query: string;
    let params: unknown[];

    if (status === 'running') {
      query = `UPDATE executions SET status = $1, started_at = $2 WHERE id = $3`;
      params = [status, timestamp || new Date(), id];
    } else if (status === 'completed' || status === 'failed' || status === 'cancelled') {
      query = `UPDATE executions SET status = $1, completed_at = $2 WHERE id = $3`;
      params = [status, timestamp || new Date(), id];
    } else {
      query = `UPDATE executions SET status = $1 WHERE id = $2`;
      params = [status, id];
    }

    const result = await pool.query(query, params);
    return (result.rowCount ?? 0) > 0;
  }

  async findByWorkflowId(workflowId: string, status?: ExecutionStatus): Promise<Execution[]> {
    const pool = getPool();
    let query = `SELECT id, workflow_id, status, input, started_at, completed_at, created_at FROM executions WHERE workflow_id = $1`;
    const params: unknown[] = [workflowId];

    if (status) {
      query += ' AND status = $2';
      params.push(status);
    }

    query += ' ORDER BY created_at DESC';

    const result = await pool.query(query, params);
    return result.rows.map(row => ({
      id: row.id,
      workflowId: row.workflow_id,
      status: row.status,
      input: row.input || undefined,
      startedAt: row.started_at || undefined,
      completedAt: row.completed_at || undefined,
      createdAt: row.created_at,
    }));
  }
}
