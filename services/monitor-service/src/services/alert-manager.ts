import type { Alert } from '@task-orchestrator/shared';
import * as alertRepository from '../repositories/alert-repository.js';

export interface CreateAlertInput {
  executionId: string;
  workflowId: string;
  severity: 'warning' | 'critical';
  message: string;
  elapsedMs: number;
  slaLimitMs: number;
}

/**
 * Manages alert lifecycle: creation, retrieval, and resolution.
 * Logs critical alerts to stderr for visibility in monitoring systems.
 */
export class AlertManager {
  async createAlert(input: CreateAlertInput): Promise<Alert> {
    const alert = await alertRepository.create(input);

    if (input.severity === 'critical') {
      console.error(
        `[ALERT][CRITICAL] Execution ${input.executionId} (workflow ${input.workflowId}): ${input.message}`
      );
    } else {
      console.warn(
        `[ALERT][WARNING] Execution ${input.executionId} (workflow ${input.workflowId}): ${input.message}`
      );
    }

    return alert;
  }

  async resolveByExecution(executionId: string): Promise<void> {
    await alertRepository.resolve(executionId);
  }

  async getRecentAlerts(hours: number = 24, limit: number = 200): Promise<Alert[]> {
    return alertRepository.findRecent(hours, limit);
  }

  async getUnresolvedAlerts(executionId: string): Promise<Alert[]> {
    return alertRepository.findUnresolvedByExecution(executionId);
  }
}
