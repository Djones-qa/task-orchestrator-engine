import { getPool } from '@task-orchestrator/shared';
import type { SLAConfig } from '@task-orchestrator/shared';

/**
 * Create a new SLA configuration
 */
export async function create(config: Omit<SLAConfig, 'id'>): Promise<SLAConfig> {
  const pool = getPool();
  const result = await pool.query<{
    id: string;
    workflow_id: string;
    max_duration_ms: number;
    warning_threshold_pct: number;
  }>(
    `INSERT INTO sla_configs (workflow_id, max_duration_ms, warning_threshold_pct)
     VALUES ($1, $2, $3)
     RETURNING id, workflow_id, max_duration_ms, warning_threshold_pct`,
    [config.workflowId, config.maxDurationMs, config.warningThresholdPct]
  );

  const row = result.rows[0];
  return {
    id: row.id,
    workflowId: row.workflow_id,
    maxDurationMs: row.max_duration_ms,
    warningThresholdPct: row.warning_threshold_pct,
  };
}

/**
 * Find SLA config by workflow ID
 */
export async function findByWorkflowId(workflowId: string): Promise<SLAConfig | null> {
  const pool = getPool();
  const result = await pool.query<{
    id: string;
    workflow_id: string;
    max_duration_ms: number;
    warning_threshold_pct: number;
  }>(
    'SELECT id, workflow_id, max_duration_ms, warning_threshold_pct FROM sla_configs WHERE workflow_id = $1',
    [workflowId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    id: row.id,
    workflowId: row.workflow_id,
    maxDurationMs: row.max_duration_ms,
    warningThresholdPct: row.warning_threshold_pct,
  };
}

/**
 * Find all SLA configs (for SLA checker polling)
 */
export async function findAll(): Promise<SLAConfig[]> {
  const pool = getPool();
  const result = await pool.query<{
    id: string;
    workflow_id: string;
    max_duration_ms: number;
    warning_threshold_pct: number;
  }>('SELECT id, workflow_id, max_duration_ms, warning_threshold_pct FROM sla_configs');

  return result.rows.map((row) => ({
    id: row.id,
    workflowId: row.workflow_id,
    maxDurationMs: row.max_duration_ms,
    warningThresholdPct: row.warning_threshold_pct,
  }));
}
