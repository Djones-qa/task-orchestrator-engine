import { getPool } from '@task-orchestrator/shared';
import { v4 as uuidv4 } from 'uuid';

export interface TriggerConfig {
  type: 'webhook' | 'schedule' | 'manual';
  scheduleId?: string;
  secret?: string;
}

export interface TriggerResult {
  webhookUrl?: string;
  scheduleId?: string;
}

export class TriggerManager {
  async handleTriggerConfig(workflowId: string, config: TriggerConfig): Promise<TriggerResult> {
    const pool = getPool();

    if (config.type === 'webhook') {
      const webhookId = uuidv4();
      const secret = config.secret || uuidv4();

      await pool.query(
        `INSERT INTO webhook_registrations (id, workflow_id, secret, active)
         VALUES ($1, $2, $3, true)
         ON CONFLICT (workflow_id) DO UPDATE SET secret = $3, active = true`,
        [webhookId, workflowId, secret]
      );

      return { webhookUrl: `/api/v1/webhooks/${workflowId}` };
    }

    if (config.type === 'schedule' && config.scheduleId) {
      return { scheduleId: config.scheduleId };
    }

    return {};
  }

  async removeTrigger(workflowId: string): Promise<void> {
    const pool = getPool();

    await pool.query(
      'UPDATE webhook_registrations SET active = false WHERE workflow_id = $1',
      [workflowId]
    );

    await pool.query(
      'UPDATE schedules SET active = false WHERE workflow_id = $1',
      [workflowId]
    );
  }
}
