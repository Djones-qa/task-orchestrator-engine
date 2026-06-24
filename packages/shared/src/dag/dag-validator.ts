import type { TaskDefinition, Edge } from '../types.js';

/**
 * Structured validation errors returned by the DAG validator.
 */
export interface DAGValidationError {
  type: 'cycle_detected' | 'invalid_edge_reference' | 'unreachable_nodes';
  message: string;
  nodes?: string[];
  edges?: Array<{ sourceTaskId: string; targetTaskId: string }>;
}

export interface DAGValidationResult {
  valid: boolean;
  errors: DAGValidationError[];
}

/**
 * Builds an adjacency list from task definitions and edges.
 * Maps each task ID to the list of task IDs it has outgoing edges to.
 */
export function buildAdjacencyList(
  tasks: TaskDefinition[],
  edges: Edge[]
): Map<string, string[]> {
  const adjacency = new Map<string, string[]>();

  for (const task of tasks) {
    adjacency.set(task.id, []);
  }

  for (const edge of edges) {
    const neighbors = adjacency.get(edge.sourceTaskId);
    if (neighbors) {
      neighbors.push(edge.targetTaskId);
    }
  }

  return adjacency;
}

/**
 * DFS-based cycle detection using white/gray/black coloring.
 * WHITE (0) = unvisited, GRAY (1) = in current DFS path, BLACK (2) = fully processed.
 * Returns the list of node IDs involved in cycles, or an empty array if no cycle exists.
 */
export function detectCycles(
  tasks: TaskDefinition[],
  edges: Edge[]
): string[] {
  const adjacency = buildAdjacencyList(tasks, edges);
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;

  const color = new Map<string, number>();
  for (const task of tasks) {
    color.set(task.id, WHITE);
  }

  const cycleNodes = new Set<string>();

  function dfs(nodeId: string, path: string[]): boolean {
    color.set(nodeId, GRAY);
    path.push(nodeId);

    const neighbors = adjacency.get(nodeId) || [];
    for (const neighbor of neighbors) {
      const neighborColor = color.get(neighbor);
      if (neighborColor === GRAY) {
        // Found a cycle - collect all nodes in the cycle path
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
    path.pop();
    return false;
  }

  for (const task of tasks) {
    if (color.get(task.id) === WHITE) {
      dfs(task.id, []);
    }
  }

  return Array.from(cycleNodes);
}

/**
 * Validates that all edge source/target IDs reference existing task definitions.
 * Returns an array of invalid edges (edges that reference non-existent task IDs).
 */
export function validateEdgeReferences(
  tasks: TaskDefinition[],
  edges: Edge[]
): Array<{ sourceTaskId: string; targetTaskId: string }> {
  const taskIds = new Set(tasks.map(t => t.id));
  const invalidEdges: Array<{ sourceTaskId: string; targetTaskId: string }> = [];

  for (const edge of edges) {
    if (!taskIds.has(edge.sourceTaskId) || !taskIds.has(edge.targetTaskId)) {
      invalidEdges.push({
        sourceTaskId: edge.sourceTaskId,
        targetTaskId: edge.targetTaskId,
      });
    }
  }

  return invalidEdges;
}

/**
 * Checks reachability from root nodes (nodes with no incoming edges) using BFS.
 * Returns an array of task IDs that are not reachable from any root node.
 */
export function checkReachability(
  tasks: TaskDefinition[],
  edges: Edge[]
): string[] {
  // Count incoming edges for each task
  const incomingCount = new Map<string, number>();
  for (const task of tasks) {
    incomingCount.set(task.id, 0);
  }
  for (const edge of edges) {
    if (incomingCount.has(edge.targetTaskId)) {
      incomingCount.set(edge.targetTaskId, (incomingCount.get(edge.targetTaskId) || 0) + 1);
    }
  }

  // Find root nodes (zero incoming edges)
  const roots = tasks.filter(t => incomingCount.get(t.id) === 0);

  // BFS from all roots
  const visited = new Set<string>();
  const queue: string[] = roots.map(r => r.id);

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);

    // Find all neighbors (outgoing edges from current)
    const neighbors = edges
      .filter(e => e.sourceTaskId === current)
      .map(e => e.targetTaskId);

    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        queue.push(neighbor);
      }
    }
  }

  // Return nodes not visited
  return tasks.filter(t => !visited.has(t.id)).map(t => t.id);
}

/**
 * Orchestrates all three DAG validation checks:
 * 1. Edge reference validity
 * 2. Cycle detection
 * 3. Reachability from root nodes
 *
 * Returns a structured result with all detected errors.
 */
export function validateDAG(
  tasks: TaskDefinition[],
  edges: Edge[]
): DAGValidationResult {
  const errors: DAGValidationError[] = [];

  // 1. Check edge references first - invalid edges should be caught before graph analysis
  const invalidEdges = validateEdgeReferences(tasks, edges);
  if (invalidEdges.length > 0) {
    errors.push({
      type: 'invalid_edge_reference',
      message: `Found ${invalidEdges.length} edge(s) referencing non-existent task definitions`,
      edges: invalidEdges,
    });
  }

  // Only perform graph-structure checks with valid edges
  const validEdges = edges.filter(e => {
    const taskIds = new Set(tasks.map(t => t.id));
    return taskIds.has(e.sourceTaskId) && taskIds.has(e.targetTaskId);
  });

  // 2. Cycle detection
  const cycleNodes = detectCycles(tasks, validEdges);
  if (cycleNodes.length > 0) {
    errors.push({
      type: 'cycle_detected',
      message: `Cycle detected involving ${cycleNodes.length} node(s)`,
      nodes: cycleNodes,
    });
  }

  // 3. Reachability check (only meaningful if no cycles)
  if (cycleNodes.length === 0) {
    const unreachableNodes = checkReachability(tasks, validEdges);
    if (unreachableNodes.length > 0) {
      errors.push({
        type: 'unreachable_nodes',
        message: `Found ${unreachableNodes.length} node(s) not reachable from any root task`,
        nodes: unreachableNodes,
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
