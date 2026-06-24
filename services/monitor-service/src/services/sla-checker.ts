import { getPool } from '@task-orchestrator/shared';
import type { SLAConfig } from '@task-orchestrator/shared';
import * as slaConfigRepository from '../repositories/sla-config-repository.js';
import { AlertManager } from './alert-manager.js';

/**
 * Polls running executions every 5 seconds and checks them against
 * SLA configurations. Emits warning alerts at the warning threshold
 * and critical alerts when the SLA limit is breached.
 */
export class SLAChecker {
  private intervalHandle: NodeJS.Timeout | null = null;
  private alertedExecutions = new Map<string, Set<string>>(); // executionId -> set of severity levels already alerted

  constructor(private alertManager: AlertManager) {}

  start(): void {
    this.intervalHandle = setInterval(() => {
      this.check().catch((err) => {
        console.error('[SLAChecker] Check error:', err);
      });
    }, 5000);
  }

  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
    this.alertedExecutions.clear();
  }

  private async check(): Promise<void> {
    const pool = getPool();
    const slaConfigs = await slaConfigRepository.findAll();

    if (slaConfigs.length === 0) return;

    // Build a map of workflowId -> SLAConfig
    const slaByWorkflow = new Map<string, SLAConfig>();
    for (const config of slaConfigs) {
      slaByWorkflow.set(config.workflowId, config);
    }

    // Find running executions for workflows with SLA configs
    const workflowIds = Array.from(slaByWorkflow.keys());
    const placeholders = workflowIds.map((_, i) => `$${i + 1}`).join(', ');

    const result = await pool.query(
      `SELECT id, workflow_id, started_at
       FROM executions
       WHERE status = 'running'
         AND workflow_id IN (${placeholders})
         AND started_at IS NOT NULL`,
      workflowIds
    );

    const now = Date.now();

    for (const row of result.rows) {
      const executionId: string = row.id;
      const workflowId: string = row.workflow_id;
      const startedAt = new Date(row.started_at).getTime();
      const elapsedMs = now - startedAt;

      const sla = slaByWorkflow.get(workflowId);
      if (!sla) continue;

      const alertedSet = this.alertedExecutions.get(executionId) || new Set();

      // Check critical threshold
      if (elapsedMs >= sla.maxDurationMs && !alertedSet.has('critical')) {
        await this.alertManager.createAlert({
          executionId,
          workflowId,
          severity: 'critical',
          message: `Execution exceeded SLA limit of ${sla.maxDurationMs}ms (elapsed: ${Math.round(elapsedMs)}ms)`,
          elapsedMs: Math.round(elapsedMs),
          slaLimitMs: sla.maxDurationMs,
        });
        alertedSet.add('critical');
        this.alertedExecutions.set(executionId, alertedSet);
      }
      // Check warning threshold
      else if (
        elapsedMs >= sla.maxDurationMs * (sla.warningThresholdPct / 100) &&
        !alertedSet.has('warning')
      ) {
        await this.alertManager.createAlert({
          executionId,
          workflowId,
          severity: 'warning',
          message: `Execution approaching SLA limit (${sla.warningThresholdPct}% threshold reached, elapsed: ${Math.round(elapsedMs)}ms)`,
          elapsedMs: Math.round(elapsedMs),
          slaLimitMs: sla.maxDurationMs,
        });
        alertedSet.add('warning');
        this.alertedExecutions.set(executionId, alertedSet);
      }
    }

    // Clean up completed executions from the alert tracking map
    this.cleanupCompletedExecutions(result.rows.map((r: { id: string }) => r.id));
  }

  private cleanupCompletedExecutions(activeIds: string[]): void {
    const activeSet = new Set(activeIds);
    for (const executionId of this.alertedExecutions.keys()) {
      if (!activeSet.has(executionId)) {
        this.alertedExecutions.delete(executionId);
      }
    }
  }
}
