import type Redis from 'ioredis';
import type { ExecutionMetrics } from '../types.js';

const METRICS_KEY = 'metrics:cache';
const DEFAULT_TTL_SECONDS = 10;

export class MetricsCache {
  constructor(private redis: Redis) {}

  /** Store execution metrics in Redis with a 10s TTL */
  async setMetrics(metrics: ExecutionMetrics): Promise<void> {
    await this.redis.set(METRICS_KEY, JSON.stringify(metrics), 'EX', DEFAULT_TTL_SECONDS);
  }

  /** Retrieve cached execution metrics, or null if expired/missing */
  async getMetrics(): Promise<ExecutionMetrics | null> {
    const data = await this.redis.get(METRICS_KEY);
    if (!data) {
      return null;
    }
    return JSON.parse(data) as ExecutionMetrics;
  }
}
