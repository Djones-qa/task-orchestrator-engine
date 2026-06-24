import type { TaskDefinition, Edge } from '../types.js';
import { buildAdjacencyList } from './dag-validator.js';

/**
 * Result of a combined DAG validation and topological sort operation.
 */
export interface TopologicalSortResult {
  /** Whether the graph is a valid DAG (no cycles). */
  valid: boolean;
  /** Ordered task definition IDs in topological order (for every edge u→v, u appears before v). Empty if invalid. */
  order: string[];
  /** Node IDs involved in a cycle, if one was detected. */
  cycleNodes?: string[];
}

/**
 * Performs DFS-based topological sort producing reverse post-order.
 * Combines cycle detection and topological ordering in a single DFS pass.
 *
 * For every directed edge (u, v) in the graph, u will appear before v
 * in the returned ordering.
 *
 * @param tasks - Array of task definitions (nodes in the DAG)
 * @param edges - Array of directed edges between tasks
 * @returns TopologicalSortResult with the ordering or cycle information
 */
export function topologicalSort(
  tasks: TaskDefinition[],
  edges: Edge[]
): TopologicalSortResult {
  const adjacency = buildAdjacencyList(tasks, edges);

  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;

  const color = new Map<string, number>();
  for (const task of tasks) {
    color.set(task.id, WHITE);
  }

  const postOrder: string[] = [];
  const cycleNodes = new Set<string>();

  function dfs(nodeId: string, path: string[]): boolean {
    color.set(nodeId, GRAY);
    path.push(nodeId);

    const neighbors = adjacency.get(nodeId) || [];
    for (const neighbor of neighbors) {
      const neighborColor = color.get(neighbor);
      if (neighborColor === GRAY) {
        // Cycle detected - collect all nodes in the cycle path
        const cycleStart = path.indexOf(neighbor);
        for (let i = cycleStart; i < path.length; i++) {
          cycleNodes.add(path[i]);
        }
        cycleNodes.add(neighbor);
        return true;
      }
      if (neighborColor === WHITE) {
        if (dfs(neighbor, path)) {
          return true;
        }
      }
    }

    color.set(nodeId, BLACK);
    postOrder.push(nodeId);
    path.pop();
    return false;
  }

  for (const task of tasks) {
    if (color.get(task.id) === WHITE) {
      if (dfs(task.id, [])) {
        return {
          valid: false,
          order: [],
          cycleNodes: Array.from(cycleNodes),
        };
      }
    }
  }

  // Reverse post-order gives topological order
  return {
    valid: true,
    order: postOrder.reverse(),
  };
}
