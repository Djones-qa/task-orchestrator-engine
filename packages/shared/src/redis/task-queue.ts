import type Redis from 'ioredis';

const TASK_QUEUE_KEY = 'task_queue';
const TASK_PROCESSING_KEY = 'task_processing';

export class TaskQueue {
  constructor(private redis: Redis) {}

  /** Enqueue a single task state ID to the task queue */
  async enqueue(taskStateId: string): Promise<void> {
    await this.redis.lpush(TASK_QUEUE_KEY, taskStateId);
  }

  /** Enqueue multiple task state IDs atomically using pipeline */
  async enqueueBatch(taskStateIds: string[]): Promise<void> {
    if (taskStateIds.length === 0) return;
    const pipeline = this.redis.pipeline();
    for (const id of taskStateIds) {
      pipeline.lpush(TASK_QUEUE_KEY, id);
    }
    await pipeline.exec();
  }

  /** Claim a task from the queue - blocking pop with 5s timeout, moves to processing list */
  async claim(timeout: number = 5): Promise<string | null> {
    const result = await this.redis.brpoplpush(TASK_QUEUE_KEY, TASK_PROCESSING_KEY, timeout);
    return result;
  }

  /** Remove task from processing list and re-enqueue to task queue */
  async requeue(taskStateId: string): Promise<void> {
    await this.redis.lrem(TASK_PROCESSING_KEY, 1, taskStateId);
    await this.redis.lpush(TASK_QUEUE_KEY, taskStateId);
  }

  /** Remove task from the processing list */
  async removeFromProcessing(taskStateId: string): Promise<void> {
    await this.redis.lrem(TASK_PROCESSING_KEY, 1, taskStateId);
  }

  /** Get all items currently in the processing list */
  async getProcessingList(): Promise<string[]> {
    return this.redis.lrange(TASK_PROCESSING_KEY, 0, -1);
  }

  /** Get current queue depth */
  async getQueueDepth(): Promise<number> {
    return this.redis.llen(TASK_QUEUE_KEY);
  }
}
