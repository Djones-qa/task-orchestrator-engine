import { getPool } from '@task-orchestrator/shared';
import type { Workflow, TaskDefinition, Edge, TriggerConfig } from '@task-orchestrator/shared';

export class WorkflowRepository {
  async create(workflow: Omit<Workflow, 'id' | 'createdAt' | 'updatedAt'>): Promise<Workflow> {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const workflowResult = await client.query(
        `INSERT INTO workflows (name, description, trigger_config)
         VALUES ($1, $2, $3)
         RETURNING id, name, description, trigger_config, created_at, updated_at`,
        [workflow.name, workflow.description || null, JSON.stringify(workflow.triggerConfig)]
      );

      const row = workflowResult.rows[0];
      const workflowId = row.id;

      const taskDefinitions: TaskDefinition[] = [];
      for (const task of workflow.taskDefinitions) {
        const taskResult = await client.query(
          `INSERT INTO task_definitions (workflow_id, name, type, config, timeout_ms, retry_policy)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id, workflow_id, name, type, config, timeout_ms, retry_policy`,
          [
            workflowId,
            task.name,
            task.type,
            JSON.stringify(task.config),
            task.timeoutMs,
            task.retryPolicy ? JSON.stringify(task.retryPolicy) : null,
          ]
        );
        const taskRow = taskResult.rows[0];
        taskDefinitions.push({
          id: taskRow.id,
          workflowId: taskRow.workflow_id,
          name: taskRow.name,
          type: taskRow.type,
          config: taskRow.config,
          timeoutMs: taskRow.timeout_ms,
          retryPolicy: taskRow.retry_policy || undefined,
        });
      }

      const edges: Edge[] = [];
      for (const edge of workflow.edges) {
        const edgeResult = await client.query(
          `INSERT INTO edges (workflow_id, source_task_id, target_task_id, condition_expr)
           VALUES ($1, $2, $3, $4)
           RETURNING id, workflow_id, source_task_id, target_task_id, condition_expr`,
          [workflowId, edge.sourceTaskId, edge.targetTaskId, edge.conditionExpr || null]
        );
        const edgeRow = edgeResult.rows[0];
        edges.push({
          id: edgeRow.id,
          workflowId: edgeRow.workflow_id,
          sourceTaskId: edgeRow.source_task_id,
          targetTaskId: edgeRow.target_task_id,
          conditionExpr: edgeRow.condition_expr || undefined,
        });
      }

      await client.query('COMMIT');

      return {
        id: row.id,
        name: row.name,
        description: row.description || undefined,
        triggerConfig: row.trigger_config as TriggerConfig,
        taskDefinitions,
        edges,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async findById(id: string): Promise<Workflow | null> {
    const pool = getPool();

    const workflowResult = await pool.query(
      `SELECT id, name, description, trigger_config, created_at, updated_at
       FROM workflows WHERE id = $1`,
      [id]
    );

    if (workflowResult.rows.length === 0) {
      return null;
    }

    const row = workflowResult.rows[0];

    const taskResult = await pool.query(
      `SELECT id, workflow_id, name, type, config, timeout_ms, retry_policy
       FROM task_definitions WHERE workflow_id = $1`,
      [id]
    );

    const edgeResult = await pool.query(
      `SELECT id, workflow_id, source_task_id, target_task_id, condition_expr
       FROM edges WHERE workflow_id = $1`,
      [id]
    );

    const taskDefinitions: TaskDefinition[] = taskResult.rows.map((r) => ({
      id: r.id,
      workflowId: r.workflow_id,
      name: r.name,
      type: r.type,
      config: r.config,
      timeoutMs: r.timeout_ms,
      retryPolicy: r.retry_policy || undefined,
    }));

    const edges: Edge[] = edgeResult.rows.map((r) => ({
      id: r.id,
      workflowId: r.workflow_id,
      sourceTaskId: r.source_task_id,
      targetTaskId: r.target_task_id,
      conditionExpr: r.condition_expr || undefined,
    }));

    return {
      id: row.id,
      name: row.name,
      description: row.description || undefined,
      triggerConfig: row.trigger_config as TriggerConfig,
      taskDefinitions,
      edges,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async findAll(page: number = 1, pageSize: number = 20): Promise<{ workflows: Workflow[]; total: number }> {
    const pool = getPool();
    const limit = Math.min(pageSize, 100);
    const offset = (page - 1) * limit;

    const countResult = await pool.query('SELECT COUNT(*) FROM workflows');
    const total = parseInt(countResult.rows[0].count, 10);

    const workflowResult = await pool.query(
      `SELECT id, name, description, trigger_config, created_at, updated_at
       FROM workflows ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    const workflows: Workflow[] = [];

    for (const row of workflowResult.rows) {
      const taskResult = await pool.query(
        `SELECT id, workflow_id, name, type, config, timeout_ms, retry_policy
         FROM task_definitions WHERE workflow_id = $1`,
        [row.id]
      );

      const edgeResult = await pool.query(
        `SELECT id, workflow_id, source_task_id, target_task_id, condition_expr
         FROM edges WHERE workflow_id = $1`,
        [row.id]
      );

      workflows.push({
        id: row.id,
        name: row.name,
        description: row.description || undefined,
        triggerConfig: row.trigger_config as TriggerConfig,
        taskDefinitions: taskResult.rows.map((r) => ({
          id: r.id,
          workflowId: r.workflow_id,
          name: r.name,
          type: r.type,
          config: r.config,
          timeoutMs: r.timeout_ms,
          retryPolicy: r.retry_policy || undefined,
        })),
        edges: edgeResult.rows.map((r) => ({
          id: r.id,
          workflowId: r.workflow_id,
          sourceTaskId: r.source_task_id,
          targetTaskId: r.target_task_id,
          conditionExpr: r.condition_expr || undefined,
        })),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      });
    }

    return { workflows, total };
  }

  async update(id: string, workflow: Omit<Workflow, 'id' | 'createdAt' | 'updatedAt'>): Promise<Workflow | null> {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const updateResult = await client.query(
        `UPDATE workflows SET name = $1, description = $2, trigger_config = $3, updated_at = NOW()
         WHERE id = $4
         RETURNING id, name, description, trigger_config, created_at, updated_at`,
        [workflow.name, workflow.description || null, JSON.stringify(workflow.triggerConfig), id]
      );

      if (updateResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return null;
      }

      const row = updateResult.rows[0];

      // Delete old task_definitions and edges (cascade handles edges referencing tasks)
      await client.query('DELETE FROM edges WHERE workflow_id = $1', [id]);
      await client.query('DELETE FROM task_definitions WHERE workflow_id = $1', [id]);

      const taskDefinitions: TaskDefinition[] = [];
      for (const task of workflow.taskDefinitions) {
        const taskResult = await client.query(
          `INSERT INTO task_definitions (workflow_id, name, type, config, timeout_ms, retry_policy)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id, workflow_id, name, type, config, timeout_ms, retry_policy`,
          [
            id,
            task.name,
            task.type,
            JSON.stringify(task.config),
            task.timeoutMs,
            task.retryPolicy ? JSON.stringify(task.retryPolicy) : null,
          ]
        );
        const taskRow = taskResult.rows[0];
        taskDefinitions.push({
          id: taskRow.id,
          workflowId: taskRow.workflow_id,
          name: taskRow.name,
          type: taskRow.type,
          config: taskRow.config,
          timeoutMs: taskRow.timeout_ms,
          retryPolicy: taskRow.retry_policy || undefined,
        });
      }

      const edges: Edge[] = [];
      for (const edge of workflow.edges) {
        const edgeResult = await client.query(
          `INSERT INTO edges (workflow_id, source_task_id, target_task_id, condition_expr)
           VALUES ($1, $2, $3, $4)
           RETURNING id, workflow_id, source_task_id, target_task_id, condition_expr`,
          [id, edge.sourceTaskId, edge.targetTaskId, edge.conditionExpr || null]
        );
        const edgeRow = edgeResult.rows[0];
        edges.push({
          id: edgeRow.id,
          workflowId: edgeRow.workflow_id,
          sourceTaskId: edgeRow.source_task_id,
          targetTaskId: edgeRow.target_task_id,
          conditionExpr: edgeRow.condition_expr || undefined,
        });
      }

      await client.query('COMMIT');

      return {
        id: row.id,
        name: row.name,
        description: row.description || undefined,
        triggerConfig: row.trigger_config as TriggerConfig,
        taskDefinitions,
        edges,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async delete(id: string): Promise<boolean> {
    const pool = getPool();
    const result = await pool.query('DELETE FROM workflows WHERE id = $1', [id]);
    return (result.rowCount ?? 0) > 0;
  }

  async hasActiveExecutions(id: string): Promise<boolean> {
    const pool = getPool();
    const result = await pool.query(
      `SELECT EXISTS(
        SELECT 1 FROM executions
        WHERE workflow_id = $1 AND status IN ('pending', 'running')
      ) AS has_active`,
      [id]
    );
    return result.rows[0].has_active;
  }
}
