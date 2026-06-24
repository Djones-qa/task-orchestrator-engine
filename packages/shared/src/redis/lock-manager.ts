import type Redis from 'ioredis';

const LOCK_PREFIX = 'lock:task:';
const DEFAULT_TTL_MS = 30000;

export class LockManager {
  constructor(private redis: Redis) {}

  /** Acquire a distributed lock for a task. Returns true if acquired. */
  async acquire(taskStateId: string, executorId: string, ttlMs: number = DEFAULT_TTL_MS): Promise<boolean> {
    const key = `${LOCK_PREFIX}${taskStateId}`;
    const result = await this.redis.set(key, executorId, 'PX', ttlMs, 'NX');
    return result === 'OK';
  }

  /** Renew a lock only if we still own it. Uses Lua script for atomicity. */
  async renew(taskStateId: string, executorId: string, ttlMs: number = DEFAULT_TTL_MS): Promise<boolean> {
    const key = `${LOCK_PREFIX}${taskStateId}`;
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("pexpire", KEYS[1], ARGV[2])
      else
        return 0
      end
    `;
    const result = await this.redis.eval(script, 1, key, executorId, String(ttlMs));
    return result === 1;
  }

  /** Release a lock only if we own it. Uses Lua script for atomicity. */
  async release(taskStateId: string, executorId: string): Promise<boolean> {
    const key = `${LOCK_PREFIX}${taskStateId}`;
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    const result = await this.redis.eval(script, 1, key, executorId);
    return result === 1;
  }

  /** Check if a lock is currently held */
  async isHeld(taskStateId: string): Promise<boolean> {
    const key = `${LOCK_PREFIX}${taskStateId}`;
    const result = await this.redis.exists(key);
    return result === 1;
  }

  /** Get the owner of a lock (null if not held) */
  async getOwner(taskStateId: string): Promise<string | null> {
    const key = `${LOCK_PREFIX}${taskStateId}`;
    return this.redis.get(key);
  }
}
