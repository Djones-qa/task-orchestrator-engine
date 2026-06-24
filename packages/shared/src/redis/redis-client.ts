import Redis from 'ioredis';

let client: Redis | null = null;
let subscriber: Redis | null = null;

export function getRedisClient(): Redis {
  if (!client) {
    client = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: 3,
      retryStrategy(times: number) {
        return Math.min(times * 200, 2000);
      },
    });
  }
  return client;
}

export function getRedisSubscriber(): Redis {
  if (!subscriber) {
    subscriber = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: 3,
    });
  }
  return subscriber;
}

export async function closeRedis(): Promise<void> {
  if (client) {
    await client.quit();
    client = null;
  }
  if (subscriber) {
    await subscriber.quit();
    subscriber = null;
  }
}
