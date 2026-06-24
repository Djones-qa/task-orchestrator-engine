import { HeartbeatStore } from '@task-orchestrator/shared';
import type { ExecutorHeartbeat } from '@task-orchestrator/shared';

export interface ExecutorHealthStatus {
  executorId: string;
  healthy: boolean;
  lastHeartbeat: Date | null;
  currentTaskCount: number;
  maxCapacity: number;
  utilizationPct: number;
  staleSinceMs: number | null;
}

const HEALTHY_THRESHOLD_MS = 90000; // 90 seconds

/**
 * Tracks executor health by reading heartbeat data from Redis.
 * An executor is considered unhealthy if its last heartbeat
 * exceeds the configured threshold (default 90s).
 */
export class ExecutorHealthTracker {
  private intervalHandle: NodeJS.Timeout | null = null;
  private lastHealthSnapshot: ExecutorHealthStatus[] = [];

  constructor(private heartbeatStore: HeartbeatStore) {}

  /** Start periodic health tracking every 10 seconds */
  start(): void {
    this.intervalHandle = setInterval(() => {
      this.refreshHealth().catch((err) => {
        console.error('[ExecutorHealthTracker] Refresh error:', err);
      });
    }, 10000);

    // Initial refresh
    this.refreshHealth().catch((err) => {
      console.error('[ExecutorHealthTracker] Initial refresh error:', err);
    });
  }

  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  /** Get health status for all known executors */
  async getAllExecutorHealth(): Promise<ExecutorHealthStatus[]> {
    if (this.lastHealthSnapshot.length === 0) {
      await this.refreshHealth();
    }
    return this.lastHealthSnapshot;
  }

  /** Check if a specific executor is healthy */
  async isExecutorHealthy(executorId: string): Promise<boolean> {
    return this.heartbeatStore.isHealthy(executorId, HEALTHY_THRESHOLD_MS);
  }

  /** Get count of healthy executors */
  async getHealthyExecutorCount(): Promise<number> {
    const health = await this.getAllExecutorHealth();
    return health.filter((e) => e.healthy).length;
  }

  private async refreshHealth(): Promise<void> {
    const heartbeats = await this.heartbeatStore.getAll();
    const now = Date.now();

    this.lastHealthSnapshot = heartbeats.map((hb: ExecutorHeartbeat) => {
      const lastTs = hb.timestamp.getTime();
      const staleSinceMs = now - lastTs;
      const healthy = staleSinceMs <= HEALTHY_THRESHOLD_MS;
      const utilizationPct =
        hb.maxCapacity > 0
          ? Math.round((hb.currentTaskCount / hb.maxCapacity) * 100 * 100) / 100
          : 0;

      return {
        executorId: hb.executorId,
        healthy,
        lastHeartbeat: hb.timestamp,
        currentTaskCount: hb.currentTaskCount,
        maxCapacity: hb.maxCapacity,
        utilizationPct,
        staleSinceMs: healthy ? null : staleSinceMs,
      };
    });
  }
}
