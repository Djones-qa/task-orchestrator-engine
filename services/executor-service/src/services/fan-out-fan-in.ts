import { TaskQueue, LockManager, EventBus } from '@task-orchestrator/shared';
import type { Edge, TaskState } from '@task-orchestrator/shared';

export class FanOutFanIn {
  constructor(
    private taskQueue: TaskQueue,
    private eventBus: EventBus
  ) {}

  async evaluateDownstream(
    completedTaskStateId: string,
    completedTaskDefId: string,
    executionId: string,
    edges: Edge[],
    taskStates: TaskState[]
  ): Promise<string[]> {
    const outgoing = edges.filter(e => e.sourceTaskId === completedTaskDefId);
    const readyTaskStateIds: string[] = [];
    const taskStateByDefId = new Map(taskStates.map(ts => [ts.taskDefinitionId, ts]));

    for (const edge of outgoing) {
      const targetState = taskStateByDefId.get(edge.targetTaskId);
      if (!targetState || targetState.status !== 'pending') continue;

      // Evaluate condition if present
      if (edge.conditionExpr) {
        const completedState = taskStateByDefId.get(completedTaskDefId);
        try {
          const conditionResult = this.evaluateCondition(edge.conditionExpr, completedState?.output);
          if (!conditionResult) {
            await this.markSkipped(edge.targetTaskId, taskStates, edges, taskStateByDefId);
            continue;
          }
        } catch (err) {
          console.error(`Condition evaluation error for edge ${edge.id}: ${edge.conditionExpr}`, err);
          await this.markSkipped(edge.targetTaskId, taskStates, edges, taskStateByDefId);
          continue;
        }
      }

      // Check fan-in: all incoming edges must be satisfied
      const incomingEdges = edges.filter(e => e.targetTaskId === edge.targetTaskId);
      const allSatisfied = incomingEdges.every(inc => {
        const upstreamState = taskStateByDefId.get(inc.sourceTaskId);
        return upstreamState && ['completed', 'skipped'].includes(upstreamState.status);
      });

      const atLeastOneCompleted = incomingEdges.some(inc => {
        const upstreamState = taskStateByDefId.get(inc.sourceTaskId);
        return upstreamState?.status === 'completed';
      });

      if (allSatisfied && atLeastOneCompleted) {
        readyTaskStateIds.push(targetState.id);
      }
    }

    // Atomic fan-out: enqueue all ready tasks
    if (readyTaskStateIds.length > 0) {
      await this.taskQueue.enqueueBatch(readyTaskStateIds);
    }

    // Publish completion event
    await this.eventBus.publishTaskCompleted(completedTaskStateId, executionId);

    return readyTaskStateIds;
  }

  private evaluateCondition(expression: string, output: unknown): boolean {
    if (!output || typeof output !== 'object') return false;
    try {
      const fn = new Function('output', `return Boolean(${expression})`);
      return fn(output);
    } catch {
      return false;
    }
  }

  private async markSkipped(
    taskDefId: string,
    taskStates: TaskState[],
    edges: Edge[],
    taskStateByDefId: Map<string, TaskState>
  ): Promise<void> {
    const targetState = taskStateByDefId.get(taskDefId);
    if (targetState && targetState.status === 'pending') {
      targetState.status = 'skipped' as any;
      // Propagate skipped through downstream
      const downstream = edges.filter(e => e.sourceTaskId === taskDefId);
      for (const edge of downstream) {
        const incomingToTarget = edges.filter(e => e.targetTaskId === edge.targetTaskId);
        const allSkippedOrConditionFalse = incomingToTarget.every(inc => {
          const upState = taskStateByDefId.get(inc.sourceTaskId);
          return upState && ['skipped', 'failed', 'cancelled', 'timed_out'].includes(upState.status);
        });
        if (allSkippedOrConditionFalse) {
          await this.markSkipped(edge.targetTaskId, taskStates, edges, taskStateByDefId);
        }
      }
    }
  }
}
