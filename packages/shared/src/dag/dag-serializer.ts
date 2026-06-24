import type { TaskDefinition, Edge } from '../types.js';

/**
 * Canonical serialized form of a DAG.
 * Tasks are sorted by ID; edges are sorted by (sourceTaskId, targetTaskId).
 */
export interface SerializedDAG {
  tasks: Array<{ id: string; name: string; type: string }>;
  edges: Array<{ sourceTaskId: string; targetTaskId: string; conditionExpr?: string }>;
}

/**
 * Serializes task definitions and edges into a canonical form.
 * - Tasks are represented as {id, name, type} sorted by ID.
 * - Edges are represented as {sourceTaskId, targetTaskId, conditionExpr} sorted by (sourceTaskId, targetTaskId).
 */
export function serialize(tasks: TaskDefinition[], edges: Edge[]): SerializedDAG {
  const sortedTasks = [...tasks]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(({ id, name, type }) => ({ id, name, type }));

  const sortedEdges = [...edges]
    .sort((a, b) => {
      const sourceCompare = a.sourceTaskId.localeCompare(b.sourceTaskId);
      if (sourceCompare !== 0) return sourceCompare;
      return a.targetTaskId.localeCompare(b.targetTaskId);
    })
    .map(({ sourceTaskId, targetTaskId, conditionExpr }) => {
      const edge: { sourceTaskId: string; targetTaskId: string; conditionExpr?: string } = {
        sourceTaskId,
        targetTaskId,
      };
      if (conditionExpr !== undefined) {
        edge.conditionExpr = conditionExpr;
      }
      return edge;
    });

  return { tasks: sortedTasks, edges: sortedEdges };
}

/**
 * Deserializes a canonical DAG form back into task definitions and edges.
 * Reconstructs minimal TaskDefinition and Edge objects from the serialized representation.
 */
export function deserialize(serialized: SerializedDAG): { tasks: TaskDefinition[]; edges: Edge[] } {
  const tasks: TaskDefinition[] = serialized.tasks.map(({ id, name, type }) => ({
    id,
    workflowId: '',
    name,
    type,
    config: {},
    timeoutMs: 300000,
  }));

  const edges: Edge[] = serialized.edges.map(({ sourceTaskId, targetTaskId, conditionExpr }) => ({
    id: '',
    workflowId: '',
    sourceTaskId,
    targetTaskId,
    conditionExpr,
  }));

  return { tasks, edges };
}
