import { serialize, deserialize } from '../../../packages/shared/src/dag/dag-serializer';
import type { TaskDefinition, Edge } from '../../../packages/shared/src/types';

describe('DAG Serializer', () => {
  const makeTasks = (ids: string[]): TaskDefinition[] =>
    ids.map((id) => ({
      id,
      workflowId: 'wf-1',
      name: `Task ${id}`,
      type: 'http',
      config: { url: 'http://example.com' },
      timeoutMs: 30000,
    }));

  const makeEdge = (source: string, target: string, condition?: string): Edge => ({
    id: `edge-${source}-${target}`,
    workflowId: 'wf-1',
    sourceTaskId: source,
    targetTaskId: target,
    conditionExpr: condition,
  });

  describe('serialize', () => {
    it('should sort tasks by ID', () => {
      const tasks = makeTasks(['c', 'a', 'b']);
      const result = serialize(tasks, []);

      expect(result.tasks.map((t) => t.id)).toEqual(['a', 'b', 'c']);
    });

    it('should only include id, name, type for tasks', () => {
      const tasks = makeTasks(['task-1']);
      const result = serialize(tasks, []);

      expect(result.tasks[0]).toEqual({
        id: 'task-1',
        name: 'Task task-1',
        type: 'http',
      });
      expect(result.tasks[0]).not.toHaveProperty('workflowId');
      expect(result.tasks[0]).not.toHaveProperty('config');
      expect(result.tasks[0]).not.toHaveProperty('timeoutMs');
    });

    it('should sort edges by sourceTaskId then targetTaskId', () => {
      const tasks = makeTasks(['a', 'b', 'c', 'd']);
      const edges = [
        makeEdge('b', 'c'),
        makeEdge('a', 'c'),
        makeEdge('a', 'b'),
        makeEdge('b', 'd'),
      ];
      const result = serialize(tasks, edges);

      expect(result.edges.map((e) => `${e.sourceTaskId}->${e.targetTaskId}`)).toEqual([
        'a->b',
        'a->c',
        'b->c',
        'b->d',
      ]);
    });

    it('should include conditionExpr when present', () => {
      const tasks = makeTasks(['a', 'b']);
      const edges = [makeEdge('a', 'b', 'output.status === 200')];
      const result = serialize(tasks, edges);

      expect(result.edges[0].conditionExpr).toBe('output.status === 200');
    });

    it('should omit conditionExpr when undefined', () => {
      const tasks = makeTasks(['a', 'b']);
      const edges = [makeEdge('a', 'b')];
      const result = serialize(tasks, edges);

      expect(result.edges[0]).not.toHaveProperty('conditionExpr');
    });

    it('should handle empty tasks and edges', () => {
      const result = serialize([], []);

      expect(result).toEqual({ tasks: [], edges: [] });
    });
  });

  describe('deserialize', () => {
    it('should reconstruct task definitions from serialized form', () => {
      const serialized = {
        tasks: [
          { id: 'a', name: 'Task A', type: 'http' },
          { id: 'b', name: 'Task B', type: 'script' },
        ],
        edges: [],
      };
      const { tasks } = deserialize(serialized);

      expect(tasks).toHaveLength(2);
      expect(tasks[0].id).toBe('a');
      expect(tasks[0].name).toBe('Task A');
      expect(tasks[0].type).toBe('http');
      expect(tasks[1].id).toBe('b');
      expect(tasks[1].name).toBe('Task B');
      expect(tasks[1].type).toBe('script');
    });

    it('should reconstruct edges from serialized form', () => {
      const serialized = {
        tasks: [{ id: 'a', name: 'A', type: 'http' }, { id: 'b', name: 'B', type: 'http' }],
        edges: [{ sourceTaskId: 'a', targetTaskId: 'b', conditionExpr: 'x > 1' }],
      };
      const { edges } = deserialize(serialized);

      expect(edges).toHaveLength(1);
      expect(edges[0].sourceTaskId).toBe('a');
      expect(edges[0].targetTaskId).toBe('b');
      expect(edges[0].conditionExpr).toBe('x > 1');
    });

    it('should handle empty serialized form', () => {
      const { tasks, edges } = deserialize({ tasks: [], edges: [] });

      expect(tasks).toEqual([]);
      expect(edges).toEqual([]);
    });
  });

  describe('round-trip', () => {
    it('should produce identical task IDs after serialize then deserialize', () => {
      const tasks = makeTasks(['z', 'a', 'm']);
      const edges = [makeEdge('a', 'm'), makeEdge('a', 'z')];

      const serialized = serialize(tasks, edges);
      const { tasks: roundTripped } = deserialize(serialized);

      const originalIds = tasks.map((t) => t.id).sort();
      const roundTrippedIds = roundTripped.map((t) => t.id).sort();
      expect(roundTrippedIds).toEqual(originalIds);
    });

    it('should produce identical edges after serialize then deserialize', () => {
      const tasks = makeTasks(['a', 'b', 'c']);
      const edges = [
        makeEdge('a', 'b', 'status === 200'),
        makeEdge('b', 'c'),
      ];

      const serialized = serialize(tasks, edges);
      const { edges: roundTripped } = deserialize(serialized);

      const originalEdgePairs = edges
        .map((e) => `${e.sourceTaskId}->${e.targetTaskId}:${e.conditionExpr ?? ''}`)
        .sort();
      const roundTrippedEdgePairs = roundTripped
        .map((e) => `${e.sourceTaskId}->${e.targetTaskId}:${e.conditionExpr ?? ''}`)
        .sort();
      expect(roundTrippedEdgePairs).toEqual(originalEdgePairs);
    });

    it('should be idempotent: serialize(deserialize(serialize(dag))) === serialize(dag)', () => {
      const tasks = makeTasks(['c', 'a', 'b']);
      const edges = [makeEdge('b', 'c'), makeEdge('a', 'b')];

      const first = serialize(tasks, edges);
      const { tasks: deserialized, edges: deserializedEdges } = deserialize(first);
      const second = serialize(deserialized, deserializedEdges);

      expect(second).toEqual(first);
    });
  });
});
