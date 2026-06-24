import { TaskQueue } from '../../../packages/shared/src/redis/task-queue';

function createMockRedis() {
  const store: Record<string, string[]> = {};

  const getList = (key: string): string[] => {
    if (!store[key]) store[key] = [];
    return store[key];
  };

  const pipelineOps: Array<() => void> = [];

  const mock = {
    lpush: jest.fn(async (key: string, value: string) => {
      getList(key).unshift(value);
      return getList(key).length;
    }),
    brpoplpush: jest.fn(async (source: string, destination: string, _timeout: number) => {
      const list = getList(source);
      if (list.length === 0) return null;
      const item = list.pop()!;
      getList(destination).unshift(item);
      return item;
    }),
    lrem: jest.fn(async (key: string, count: number, value: string) => {
      const list = getList(key);
      let removed = 0;
      const limit = Math.abs(count) || list.length;
      for (let i = 0; i < list.length && removed < limit; i++) {
        if (list[i] === value) {
          list.splice(i, 1);
          removed++;
          i--;
        }
      }
      return removed;
    }),
    lrange: jest.fn(async (key: string, start: number, stop: number) => {
      const list = getList(key);
      const end = stop === -1 ? list.length : stop + 1;
      return list.slice(start, end);
    }),
    llen: jest.fn(async (key: string) => {
      return getList(key).length;
    }),
    pipeline: jest.fn(() => {
      pipelineOps.length = 0;
      return {
        lpush: jest.fn((key: string, value: string) => {
          pipelineOps.push(() => {
            getList(key).unshift(value);
          });
        }),
        exec: jest.fn(async () => {
          for (const op of pipelineOps) op();
          return pipelineOps.map(() => [null, 'OK']);
        }),
      };
    }),
    _store: store,
  };

  return mock;
}

describe('TaskQueue', () => {
  let mockRedis: ReturnType<typeof createMockRedis>;
  let taskQueue: TaskQueue;

  beforeEach(() => {
    mockRedis = createMockRedis();
    taskQueue = new TaskQueue(mockRedis as any);
  });

  describe('enqueue', () => {
    it('adds a task state ID to the queue', async () => {
      await taskQueue.enqueue('task-1');
      expect(mockRedis.lpush).toHaveBeenCalledWith('task_queue', 'task-1');
      expect(await taskQueue.getQueueDepth()).toBe(1);
    });

    it('adds multiple tasks to the queue sequentially', async () => {
      await taskQueue.enqueue('task-1');
      await taskQueue.enqueue('task-2');
      expect(await taskQueue.getQueueDepth()).toBe(2);
    });
  });

  describe('enqueueBatch', () => {
    it('does nothing for an empty array', async () => {
      await taskQueue.enqueueBatch([]);
      expect(mockRedis.pipeline).not.toHaveBeenCalled();
    });

    it('enqueues multiple tasks atomically using pipeline', async () => {
      await taskQueue.enqueueBatch(['task-1', 'task-2', 'task-3']);
      expect(mockRedis.pipeline).toHaveBeenCalled();
      expect(await taskQueue.getQueueDepth()).toBe(3);
    });
  });

  describe('claim', () => {
    it('returns null when the queue is empty', async () => {
      const result = await taskQueue.claim();
      expect(result).toBeNull();
    });

    it('claims a task from the queue and moves it to processing', async () => {
      await taskQueue.enqueue('task-1');
      const result = await taskQueue.claim();
      expect(result).toBe('task-1');
      expect(await taskQueue.getQueueDepth()).toBe(0);
      const processing = await taskQueue.getProcessingList();
      expect(processing).toContain('task-1');
    });

    it('uses FIFO ordering (right pop from left-pushed list)', async () => {
      await taskQueue.enqueue('task-1');
      await taskQueue.enqueue('task-2');
      const first = await taskQueue.claim();
      expect(first).toBe('task-1');
    });

    it('passes the timeout to brpoplpush', async () => {
      await taskQueue.claim(10);
      expect(mockRedis.brpoplpush).toHaveBeenCalledWith('task_queue', 'task_processing', 10);
    });

    it('defaults to 5 second timeout', async () => {
      await taskQueue.claim();
      expect(mockRedis.brpoplpush).toHaveBeenCalledWith('task_queue', 'task_processing', 5);
    });
  });

  describe('requeue', () => {
    it('removes from processing and adds back to queue', async () => {
      await taskQueue.enqueue('task-1');
      await taskQueue.claim();

      await taskQueue.requeue('task-1');
      expect(await taskQueue.getQueueDepth()).toBe(1);
      const processing = await taskQueue.getProcessingList();
      expect(processing).not.toContain('task-1');
    });
  });

  describe('removeFromProcessing', () => {
    it('removes a task from the processing list', async () => {
      await taskQueue.enqueue('task-1');
      await taskQueue.claim();

      await taskQueue.removeFromProcessing('task-1');
      const processing = await taskQueue.getProcessingList();
      expect(processing).not.toContain('task-1');
    });
  });

  describe('getProcessingList', () => {
    it('returns empty array when nothing is processing', async () => {
      const processing = await taskQueue.getProcessingList();
      expect(processing).toEqual([]);
    });

    it('returns all items in the processing list', async () => {
      await taskQueue.enqueue('task-1');
      await taskQueue.enqueue('task-2');
      await taskQueue.claim();
      await taskQueue.claim();

      const processing = await taskQueue.getProcessingList();
      expect(processing).toHaveLength(2);
      expect(processing).toContain('task-1');
      expect(processing).toContain('task-2');
    });
  });

  describe('getQueueDepth', () => {
    it('returns 0 for an empty queue', async () => {
      expect(await taskQueue.getQueueDepth()).toBe(0);
    });

    it('returns the number of items in the queue', async () => {
      await taskQueue.enqueue('task-1');
      await taskQueue.enqueue('task-2');
      await taskQueue.enqueue('task-3');
      expect(await taskQueue.getQueueDepth()).toBe(3);
    });
  });
});
