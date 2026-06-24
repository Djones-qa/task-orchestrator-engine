import { getPool } from '@task-orchestrator/shared';
import type { WebhookRegistration } from '@task-orchestrator/shared';

export class WebhookRepository {
  async create(registration: Omit<WebhookRegistration, 'id' | 'createdAt'>): Promise<WebhookRegistration> {
    const pool = getPool();
    const result = await pool.query(
      `INSERT INTO webhook_registrations (workflow_id, secret, active)
       VALUES ($1, $2, $3)
       RETURNING id, workflow_id, secret, active, created_at`,
      [registration.workflowId, registration.secret || null, registration.active]
    );

    const row = result.rows[0];
    return {
      id: row.id,
      workflowId: row.workflow_id,
      secret: row.secret || undefined,
      active: row.active,
      createdAt: row.created_at,
    };
  }

  async findById(id: string): Promise<WebhookRegistration | null> {
    const pool = getPool();
    const result = await pool.query(
      `SELECT id, workflow_id, secret, active, created_at
       FROM webhook_registrations WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      workflowId: row.workflow_id,
      secret: row.secret || undefined,
      active: row.active,
      createdAt: row.created_at,
    };
  }

  async findByWorkflowId(workflowId: string): Promise<WebhookRegistration[]> {
    const pool = getPool();
    const result = await pool.query(
      `SELECT id, workflow_id, secret, active, created_at
       FROM webhook_registrations WHERE workflow_id = $1`,
      [workflowId]
    );

    return result.rows.map((row) => ({
      id: row.id,
      workflowId: row.workflow_id,
      secret: row.secret || undefined,
      active: row.active,
      createdAt: row.created_at,
    }));
  }

  async delete(id: string): Promise<boolean> {
    const pool = getPool();
    const result = await pool.query(
      'DELETE FROM webhook_registrations WHERE id = $1',
      [id]
    );
    return (result.rowCount ?? 0) > 0;
  }
}
