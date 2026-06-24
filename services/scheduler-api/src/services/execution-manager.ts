import { getPool, isTerminalState, EventBus } from '@task-orchestrator/shared';
import type { TaskStatus } from '@task-orchestrator/shared';

export class ExecutionManager {
  constructor(private eventBus: EventBus) {}

  async start(): Promise<void> {
    await this.eventBus.subscribe('task:completed', async (event) => {
      await this.checkExecutionCompletion(event.executionId);
    });
    await this.eventBus.subscribe('task:failed', async (event) => {
      await this.checkExecutionCompletion(event.executionId);
    });
  }

  async checkExecutionCompletion(executionId: string): Promise<void> {
    const pool = getPool();

    const taskStatesResult = await pool.query(
      'SELECT status FROM task_states WHERE execution_id = $1',
      [executionId]
    );

    const statuses: TaskStatus[] = taskStatesResult.rows.map((r: { status: TaskStatus }) => r.status);

    if (statuses.length === 0) return;

    const allTerminal = statuses.every((s) => isTerminalState(s));
    if (!allTerminal) return;

    const hasFailed = statuses.some((s) => s === 'failed');

    const finalStatus = hasFailed ? 'failed' : 'completed';

    await pool.query(
      'UPDATE executions SET status = $1, completed_at = NOW() WHERE id = $2 AND status = $3',
      [finalStatus, executionId, 'running']
    );
  }
}
