import { getPool } from '@task-orchestrator/shared';
import type { Alert } from '@task-orchestrator/shared';

interface AlertRow {
  id: string;
  execution_id: string;
  workflow_id: string;
  severity: 'warning' | 'critical';
  message: string;
  elapsed_ms: number;
  sla_limit_ms: number;
  resolved: boolean;
  resolved_at: Date | null;
  created_at: Date;
}

function mapRow(row: AlertRow): Alert {
  return {
    id: row.id,
    executionId: row.execution_id,
    workflowId: row.workflow_id,
    severity: row.severity,
    message: row.message,
    elapsedMs: row.elapsed_ms,
    slaLimitMs: row.sla_limit_ms,
    resolved: row.resolved,
    resolvedAt: row.resolved_at ?? undefined,
    createdAt: row.created_at,
  };
}

/**
 * Create a new alert
 */
export async function create(alert: Omit<Alert, 'id' | 'createdAt' | 'resolved' | 'resolvedAt'>): Promise<Alert> {
  const pool = getPool();
  const result = await pool.query<AlertRow>(
    `INSERT INTO alerts (execution_id, workflow_id, severity, message, elapsed_ms, sla_limit_ms)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [alert.executionId, alert.workflowId, alert.severity, alert.message, alert.elapsedMs, alert.slaLimitMs]
  );

  return mapRow(result.rows[0]);
}

/**
 * Find recent alerts within the specified hours, limited to max count,
 * sorted by severity then timestamp descending.
 */
export async function findRecent(hours: number = 24, limit: number = 200): Promise<Alert[]> {
  const pool = getPool();
  const result = await pool.query<AlertRow>(
    `SELECT * FROM alerts
     WHERE created_at >= NOW() - INTERVAL '1 hour' * $1
     ORDER BY
       CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 END,
       created_at DESC
     LIMIT $2`,
    [hours, limit]
  );

  return result.rows.map(mapRow);
}

/**
 * Resolve an alert by execution ID
 */
export async function resolve(executionId: string): Promise<void> {
  const pool = getPool();
  await pool.query(
    `UPDATE alerts SET resolved = TRUE, resolved_at = NOW()
     WHERE execution_id = $1 AND resolved = FALSE`,
    [executionId]
  );
}

/**
 * Find unresolved alerts for an execution
 */
export async function findUnresolvedByExecution(executionId: string): Promise<Alert[]> {
  const pool = getPool();
  const result = await pool.query<AlertRow>(
    'SELECT * FROM alerts WHERE execution_id = $1 AND resolved = FALSE',
    [executionId]
  );

  return result.rows.map(mapRow);
}
