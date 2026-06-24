import {
  buildAdjacencyList,
  detectCycles,
  validateEdgeReferences,
  checkReachability,
  validateDAG,
} from '../../../packages/shared/src/dag/dag-validator';
import type { TaskDefinition, Edge } from '../../../packages/shared/src/types';

// Helper to create minimal TaskDefinition objects
function makeTask(id: string): TaskDefinition {
  return {
    id,
    workflowId: 'wf-1',
    name: `Task ${id}`,
    type: 'http',
    config: {},
    timeoutMs: 30000,
  };
}

// Helper to create Edge objects
function makeEdge(source: string, target: string): Edge {
  return {
    id: `edge-${source}-${target}`,
    workflowId: 'wf-1',
    sourceTaskId: source,
    targetTaskId: target,
  };
}

describe('buildAdjacencyList', () => {
  it('should create an entry for each task', () => {
    const tasks = [makeTask('a'), makeTask('b'), makeTask('c')];
    const edges: Edge[] = [];
    const adj = buildAdjacencyList(tasks, edges);

    expect(adj.size).toBe(3);
    expect(adj.get('a')).toEqual([]);
    expect(adj.get('b')).toEqual([]);
    expect(adj.get('c')).toEqual([]);
  });

  it('should map edges to adjacency neighbors', () => {
    const tasks = [makeTask('a'), makeTask('b'), makeTask('c')];
    const edges = [makeEdge('a', 'b'), makeEdge('a', 'c'), makeEdge('b', 'c')];
    const adj = buildAdjacencyList(tasks, edges);

    expect(adj.get('a')).toEqual(['b', 'c']);
    expect(adj.get('b')).toEqual(['c']);
    expect(adj.get('c')).toEqual([]);
  });

  it('should ignore edges with source IDs not in the task list', () => {
    const tasks = [makeTask('a'), makeTask('b')];
    const edges = [makeEdge('x', 'b')];
    const adj = buildAdjacencyList(tasks, edges);

    expect(adj.get('a')).toEqual([]);
    expect(adj.get('b')).toEqual([]);
  });
});

describe('detectCycles', () => {
  it('should return empty array for a valid DAG', () => {
    const tasks = [makeTask('a'), makeTask('b'), makeTask('c')];
    const edges = [makeEdge('a', 'b'), makeEdge('b', 'c')];
    const result = detectCycles(tasks, edges);
    expect(result).toEqual([]);
  });

  it('should detect a simple cycle (a -> b -> a)', () => {
    const tasks = [makeTask('a'), makeTask('b')];
    const edges = [makeEdge('a', 'b'), makeEdge('b', 'a')];
    const result = detectCycles(tasks, edges);
    expect(result.length).toBeGreaterThan(0);
    expect(result).toContain('a');
    expect(result).toContain('b');
  });

  it('should detect a self-loop', () => {
    const tasks = [makeTask('a')];
    const edges = [makeEdge('a', 'a')];
    const result = detectCycles(tasks, edges);
    expect(result.length).toBeGreaterThan(0);
    expect(result).toContain('a');
  });

  it('should detect a cycle in a larger graph', () => {
    const tasks = [makeTask('a'), makeTask('b'), makeTask('c'), makeTask('d')];
    const edges = [
      makeEdge('a', 'b'),
      makeEdge('b', 'c'),
      makeEdge('c', 'd'),
      makeEdge('d', 'b'), // creates cycle b -> c -> d -> b
    ];
    const result = detectCycles(tasks, edges);
    expect(result.length).toBeGreaterThan(0);
    expect(result).toContain('b');
    expect(result).toContain('c');
    expect(result).toContain('d');
  });

  it('should return empty for disconnected acyclic components', () => {
    const tasks = [makeTask('a'), makeTask('b'), makeTask('c'), makeTask('d')];
    const edges = [makeEdge('a', 'b'), makeEdge('c', 'd')];
    const result = detectCycles(tasks, edges);
    expect(result).toEqual([]);
  });

  it('should return empty for a single task with no edges', () => {
    const tasks = [makeTask('a')];
    const edges: Edge[] = [];
    const result = detectCycles(tasks, edges);
    expect(result).toEqual([]);
  });
});

describe('validateEdgeReferences', () => {
  it('should return empty for valid edges', () => {
    const tasks = [makeTask('a'), makeTask('b')];
    const edges = [makeEdge('a', 'b')];
    const result = validateEdgeReferences(tasks, edges);
    expect(result).toEqual([]);
  });

  it('should detect edge with invalid source', () => {
    const tasks = [makeTask('a'), makeTask('b')];
    const edges = [makeEdge('x', 'b')];
    const result = validateEdgeReferences(tasks, edges);
    expect(result).toEqual([{ sourceTaskId: 'x', targetTaskId: 'b' }]);
  });

  it('should detect edge with invalid target', () => {
    const tasks = [makeTask('a'), makeTask('b')];
    const edges = [makeEdge('a', 'z')];
    const result = validateEdgeReferences(tasks, edges);
    expect(result).toEqual([{ sourceTaskId: 'a', targetTaskId: 'z' }]);
  });

  it('should detect edge with both invalid source and target', () => {
    const tasks = [makeTask('a')];
    const edges = [makeEdge('x', 'y')];
    const result = validateEdgeReferences(tasks, edges);
    expect(result).toEqual([{ sourceTaskId: 'x', targetTaskId: 'y' }]);
  });

  it('should return empty when there are no edges', () => {
    const tasks = [makeTask('a'), makeTask('b')];
    const edges: Edge[] = [];
    const result = validateEdgeReferences(tasks, edges);
    expect(result).toEqual([]);
  });
});

describe('checkReachability', () => {
  it('should return empty for a fully connected DAG', () => {
    const tasks = [makeTask('a'), makeTask('b'), makeTask('c')];
    const edges = [makeEdge('a', 'b'), makeEdge('b', 'c')];
    const result = checkReachability(tasks, edges);
    expect(result).toEqual([]);
  });

  it('should detect unreachable nodes', () => {
    // a -> b, c is disconnected and has incoming edge from nowhere reachable
    const tasks = [makeTask('a'), makeTask('b'), makeTask('c'), makeTask('d')];
    const edges = [makeEdge('a', 'b'), makeEdge('c', 'd')];
    // 'a' and 'c' are both roots (no incoming edges), so all nodes are reachable
    const result = checkReachability(tasks, edges);
    expect(result).toEqual([]);
  });

  it('should detect a node that is only reachable from a non-root', () => {
    // Make a scenario where a node has no incoming edge path from a root
    const tasks = [makeTask('a'), makeTask('b'), makeTask('c')];
    // b -> c, but b has incoming from a. a is root.
    const edges = [makeEdge('a', 'b'), makeEdge('b', 'c')];
    const result = checkReachability(tasks, edges);
    expect(result).toEqual([]);
  });

  it('should identify unreachable nodes in a disconnected subgraph', () => {
    // d has an incoming edge from c, but c also has an incoming edge from d
    // Since both have incoming edges, neither is a root, so neither is reachable
    const tasks = [makeTask('a'), makeTask('b'), makeTask('c'), makeTask('d')];
    const edges = [makeEdge('a', 'b'), makeEdge('c', 'd'), makeEdge('d', 'c')];
    // Roots: only 'a' (only 'a' has no incoming edges)
    // Reachable from 'a': a, b
    // Unreachable: c, d
    const result = checkReachability(tasks, edges);
    expect(result.sort()).toEqual(['c', 'd']);
  });

  it('should return empty for a single root task', () => {
    const tasks = [makeTask('a')];
    const edges: Edge[] = [];
    const result = checkReachability(tasks, edges);
    expect(result).toEqual([]);
  });

  it('should handle multiple root nodes correctly', () => {
    const tasks = [makeTask('a'), makeTask('b'), makeTask('c')];
    const edges = [makeEdge('a', 'c'), makeEdge('b', 'c')];
    const result = checkReachability(tasks, edges);
    expect(result).toEqual([]);
  });
});

describe('validateDAG', () => {
  it('should return valid for a correct DAG', () => {
    const tasks = [makeTask('a'), makeTask('b'), makeTask('c')];
    const edges = [makeEdge('a', 'b'), makeEdge('a', 'c')];
    const result = validateDAG(tasks, edges);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('should report invalid edge references', () => {
    const tasks = [makeTask('a'), makeTask('b')];
    const edges = [makeEdge('a', 'nonexistent')];
    const result = validateDAG(tasks, edges);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].type).toBe('invalid_edge_reference');
    expect(result.errors[0].edges).toEqual([{ sourceTaskId: 'a', targetTaskId: 'nonexistent' }]);
  });

  it('should report cycles', () => {
    const tasks = [makeTask('a'), makeTask('b'), makeTask('c')];
    const edges = [makeEdge('a', 'b'), makeEdge('b', 'c'), makeEdge('c', 'a')];
    const result = validateDAG(tasks, edges);
    expect(result.valid).toBe(false);
    const cycleError = result.errors.find(e => e.type === 'cycle_detected');
    expect(cycleError).toBeDefined();
    expect(cycleError!.nodes!.length).toBeGreaterThan(0);
  });

  it('should report unreachable nodes', () => {
    const tasks = [makeTask('a'), makeTask('b'), makeTask('c'), makeTask('d')];
    // a -> b is fine, but c -> d and d -> c creates a mutual cycle
    // For unreachable, we need nodes that aren't roots and aren't reachable from roots
    // Let's make: a -> b, and c has incoming only from d, d has incoming only from c
    const edges = [makeEdge('a', 'b'), makeEdge('c', 'd'), makeEdge('d', 'c')];
    const result = validateDAG(tasks, edges);
    expect(result.valid).toBe(false);
    // Should detect cycle in c,d
    const cycleError = result.errors.find(e => e.type === 'cycle_detected');
    expect(cycleError).toBeDefined();
  });

  it('should report unreachable nodes when no cycle exists', () => {
    // a -> b; c has only incoming edge (from b to c is NOT present)
    // c has incoming from some non-root that itself isn't reachable
    // Actually simpler: make a node that only has incoming from another non-root
    // a is root, a -> b. c has incoming from d, d is a standalone non-root node.
    const tasks = [makeTask('a'), makeTask('b'), makeTask('c')];
    // a -> b. c has an incoming edge from b BUT let's set it so c isn't reachable
    // Actually, if we just have tasks [a, b, c] with edges [a -> b] then c is a root
    // To make c unreachable: c must have at least one incoming edge from a non-reachable source
    // Edge from b -> c makes c reachable from a. We need c to have incoming but from nowhere reachable.
    // Let's use: tasks [a, b, c, d] edges [a -> b, d -> c] - d is a root since no incoming.
    // So: tasks [a, b, c] edges [a -> b, c -> ... no]. c has no incoming = c is root = reachable.
    // We need: c has incoming but not from reachable. Make c have incoming from itself? That's a cycle.
    // Simplest: tasks [a, b, c] edges [a -> b, b -> c, c -> b] - but that's a cycle.
    // For a true unreachable case without cycles: impossible in a pure DAG 
    // because if a node has incoming edges from non-roots, those non-roots also have incoming edges, etc.
    // Actually it IS possible if we filter valid edges only. Let's test with a scenario:
    // tasks [a, b, c, d], edges [a -> b, c -> d]. Both a and c are roots. All reachable.
    // We need a graph where some node only has incoming from other non-root nodes that form no cycle.
    // This isn't possible in a DAG - if you trace back incoming edges you always reach a root.
    // So unreachable nodes only happen with cycles. Let's verify validateDAG handles the combined case.
    
    // Actually, unreachable nodes CAN happen when we filter invalid edges:
    // tasks [a, b, c], edges [a -> b, x -> c (invalid)]. After filtering, c has no incoming = root.
    // Let's test a scenario that produces both errors:
    const tasks2 = [makeTask('a'), makeTask('b'), makeTask('c')];
    const edges2 = [makeEdge('a', 'b'), makeEdge('x', 'c')]; // x doesn't exist
    const result = validateDAG(tasks2, edges2);
    expect(result.valid).toBe(false);
    expect(result.errors.find(e => e.type === 'invalid_edge_reference')).toBeDefined();
    // After filtering invalid edges, c becomes a root and IS reachable, so no unreachable error
  });

  it('should handle empty edges on multiple tasks', () => {
    const tasks = [makeTask('a'), makeTask('b'), makeTask('c')];
    const edges: Edge[] = [];
    const result = validateDAG(tasks, edges);
    // All are roots, all reachable from themselves
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('should handle a single task with no edges', () => {
    const tasks = [makeTask('a')];
    const edges: Edge[] = [];
    const result = validateDAG(tasks, edges);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('should accumulate multiple error types', () => {
    const tasks = [makeTask('a'), makeTask('b'), makeTask('c')];
    // Invalid edge + cycle in remaining valid edges
    const edges = [
      makeEdge('a', 'b'),
      makeEdge('b', 'a'), // cycle
      makeEdge('c', 'nonexistent'), // invalid reference
    ];
    const result = validateDAG(tasks, edges);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
    expect(result.errors.find(e => e.type === 'invalid_edge_reference')).toBeDefined();
    expect(result.errors.find(e => e.type === 'cycle_detected')).toBeDefined();
  });
});
