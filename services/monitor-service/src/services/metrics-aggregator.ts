import { getPool, MetricsCache } from '@task-orchestrator/shared';
import type { ExecutionMetrics } from '@task-orchestrator/shared';

/**
 * Aggregates execution metrics from PostgreSQL and caches them in Redis.
 * Computes active execution count, success rate, average duration,
 * and throughput over a rolling 60-minute window.
 */
export class MetricsAggregator {
  private intervalHandle: NodeJS.Timeout | null = null;

  constructor(private metricsCache: MetricsCache) {}

  /** Start periodic aggregation every 10 seconds */
  start(): void {
    this.intervalHandle = setInterval(() => {
      this.aggregate().catch((err) => {
        console.error('[MetricsAggregator] Aggregation error:', err);
      });
    }, 10000);

    // Run initial aggregation immediately
    this.aggregate().catch((err) => {
      console.error('[MetricsAggregator] Initial aggregation error:', err);
    });
  }

  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  /** Get metrics from cache, or compute fresh if cache is empty */
  async getMetrics(): Promise<ExecutionMetrics> {
    const cached = await this.metricsCache.getMetrics();
    if (cached) {
      return cached;
    }
    return this.aggregate();
  }

  /** Compute metrics from PostgreSQL and cache in Redis */
  private async aggregate(): Promise<ExecutionMetrics> {
    const pool = getPool();
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    // Active execution count
    const activeResult = await pool.query(
      `SELECT COUNT(*) as count FROM executions WHERE status IN ('pending', 'running')`
    );
    const activeExecutionCount = parseInt(activeResult.rows[0].count, 10);

    // Completed and failed in last 60 minutes for success rate
    const completedResult = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'completed') as completed,
         COUNT(*) FILTER (WHERE status IN ('completed', 'failed')) as total,
         AVG(EXTRACT(EPOCH FROM (completed_at - started_at)) * 1000)
           FILTER (WHERE status = 'completed' AND completed_at IS NOT NULL AND started_at IS NOT NULL) as avg_duration
       FROM executions
       WHERE completed_at >= $1`,
      [oneHourAgo]
    );

    const completed = parseInt(completedResult.rows[0].completed || '0', 10);
    const total = parseInt(completedResult.rows[0].total || '0', 10);
    const avgDurationMs = parseFloat(completedResult.rows[0].avg_duration || '0');
    const successRatePct = total > 0 ? Math.round((completed / total) * 100 * 100) / 100 : 100;

    // Throughput: completed executions per minute over last 60 minutes
    const throughputPerMinute = Math.round((completed / 60) * 100) / 100;

    const metrics: ExecutionMetrics = {
      activeExecutionCount,
      successRatePct,
      avgDurationMs: Math.round(avgDurationMs),
      throughputPerMinute,
    };

    await this.metricsCache.setMetrics(metrics);
    return metrics;
  }
}
