import { HeartbeatStore } from '@task-orchestrator/shared';

export interface HeartbeatEmitterOptions {
  executorId: string;
  heartbeatStore: HeartbeatStore;
  maxCapacity: number;
  intervalMs?: number;
}

/**
 * Emits periodic heartbeats to Redis so the monitor service
 * can detect healthy vs stale executors.
 * - Sends initial heartbeat within 5 seconds of startup.
 * - Sends heartbeat every 30 seconds (configurable).
 * - Stores executorId, timestamp, taskCount, maxCapacity with 90s TTL.
 */
export class HeartbeatEmitter {
  private interval: NodeJS.Timeout | null = null;
  private initialTimeout: NodeJS.Timeout | null = null;
  private running = false;
  private currentTaskCount = 0;

  private readonly executorId: string;
  private readonly heartbeatStore: HeartbeatStore;
  private readonly maxCapacity: number;
  private readonly intervalMs: number;

  constructor(options: HeartbeatEmitterOptions) {
    this.executorId = options.executorId;
    this.heartbeatStore = options.heartbeatStore;
    this.maxCapacity = options.maxCapacity;
    this.intervalMs = options.intervalMs ?? 30000;
  }

  /** Start emitting heartbeats. Sends initial heartbeat within 5 seconds. */
  start(): void {
    if (this.running) return;
    this.running = true;

    // Send initial heartbeat within 5 seconds
    this.initialTimeout = setTimeout(async () => {
      await this.sendHeartbeat();

      // Start the regular interval after initial heartbeat
      this.interval = setInterval(async () => {
        await this.sendHeartbeat();
      }, this.intervalMs);
    }, Math.min(5000, this.intervalMs));
  }

  /** Stop emitting heartbeats and clean up timers. */
  stop(): void {
    this.running = false;

    if (this.initialTimeout) {
      clearTimeout(this.initialTimeout);
      this.initialTimeout = null;
    }

    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  /** Update the current task count reported in heartbeats. */
  setTaskCount(count: number): void {
    this.currentTaskCount = count;
  }

  /** Check if the emitter is currently running. */
  isRunning(): boolean {
    return this.running;
  }

  private async sendHeartbeat(): Promise<void> {
    if (!this.running) return;

    try {
      await this.heartbeatStore.send(
        this.executorId,
        this.currentTaskCount,
        this.maxCapacity,
      );
    } catch (error) {
      console.error('[HeartbeatEmitter] Failed to send heartbeat:', error);
    }
  }
}
