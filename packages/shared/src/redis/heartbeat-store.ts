import type Redis from 'ioredis';
import type { ExecutorHeartbeat } from '../types.js';

const HEARTBEAT_PREFIX = 'heartbeat:';
const DEFAULT_TTL_SECONDS = 90;

export class HeartbeatStore {
  constructor(private redis: Redis) {}

  /** Send a heartbeat for an executor, storing timestamp, task count, and capacity */
  async send(executorId: string, taskCount: number, maxCapacity: number): Promise<void> {
    const key = `${HEARTBEAT_PREFIX}${executorId}`;
    await this.redis.hset(key, {
      executorId,
      timestamp: Date.now().toString(),
      currentTaskCount: taskCount.toString(),
      maxCapacity: maxCapacity.toString(),
    });
    await this.redis.expire(key, DEFAULT_TTL_SECONDS);
  }

  /** Get the heartbeat for a specific executor */
  async get(executorId: string): Promise<ExecutorHeartbeat | null> {
    const key = `${HEARTBEAT_PREFIX}${executorId}`;
    const data = await this.redis.hgetall(key);
    if (!data || Object.keys(data).length === 0) {
      return null;
    }
    return this.parseHeartbeat(data);
  }

  /** Get all executor heartbeats by scanning for heartbeat:* keys */
  async getAll(): Promise<ExecutorHeartbeat[]> {
    const heartbeats: ExecutorHeartbeat[] = [];
    let cursor = '0';

    do {
      const [nextCursor, keys] = await this.redis.scan(
        cursor,
        'MATCH',
        `${HEARTBEAT_PREFIX}*`,
        'COUNT',
        100,
      );
      cursor = nextCursor;

      for (const key of keys) {
        const data = await this.redis.hgetall(key);
        if (data && Object.keys(data).length > 0) {
          heartbeats.push(this.parseHeartbeat(data));
        }
      }
    } while (cursor !== '0');

    return heartbeats;
  }

  /** Check if an executor's heartbeat is within the healthy threshold */
  async isHealthy(executorId: string, thresholdMs: number = 90000): Promise<boolean> {
    const heartbeat = await this.get(executorId);
    if (!heartbeat) {
      return false;
    }
    const elapsed = Date.now() - heartbeat.timestamp.getTime();
    return elapsed <= thresholdMs;
  }

  private parseHeartbeat(data: Record<string, string>): ExecutorHeartbeat {
    return {
      executorId: data.executorId,
      timestamp: new Date(Number(data.timestamp)),
      currentTaskCount: Number(data.currentTaskCount),
      maxCapacity: Number(data.maxCapacity),
    };
  }
}
