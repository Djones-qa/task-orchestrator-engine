import { getRedisClient, getRedisSubscriber, closeRedis } from '../../../packages/shared/src/redis/redis-client';

// Mock ioredis
jest.mock('ioredis', () => {
  const mockQuit = jest.fn().mockResolvedValue('OK');
  const MockRedis = jest.fn().mockImplementation(() => ({
    quit: mockQuit,
    status: 'ready',
  }));
  return { default: MockRedis, __esModule: true };
});

describe('redis-client', () => {
  beforeEach(async () => {
    // Reset singleton state between tests
    await closeRedis();
    jest.clearAllMocks();
  });

  describe('getRedisClient', () => {
    it('returns a Redis instance', () => {
      const client = getRedisClient();
      expect(client).toBeDefined();
      expect(client.quit).toBeDefined();
    });

    it('returns the same instance on subsequent calls (singleton)', () => {
      const client1 = getRedisClient();
      const client2 = getRedisClient();
      expect(client1).toBe(client2);
    });

    it('creates a new instance after closeRedis is called', async () => {
      const client1 = getRedisClient();
      await closeRedis();
      const client2 = getRedisClient();
      expect(client2).not.toBe(client1);
    });
  });

  describe('getRedisSubscriber', () => {
    it('returns a Redis instance', () => {
      const subscriber = getRedisSubscriber();
      expect(subscriber).toBeDefined();
      expect(subscriber.quit).toBeDefined();
    });

    it('returns the same instance on subsequent calls (singleton)', () => {
      const sub1 = getRedisSubscriber();
      const sub2 = getRedisSubscriber();
      expect(sub1).toBe(sub2);
    });

    it('returns a different instance from getRedisClient', () => {
      const client = getRedisClient();
      const subscriber = getRedisSubscriber();
      expect(client).not.toBe(subscriber);
    });

    it('creates a new instance after closeRedis is called', async () => {
      const sub1 = getRedisSubscriber();
      await closeRedis();
      const sub2 = getRedisSubscriber();
      expect(sub2).not.toBe(sub1);
    });
  });

  describe('closeRedis', () => {
    it('calls quit on both client and subscriber', async () => {
      const client = getRedisClient();
      const subscriber = getRedisSubscriber();
      await closeRedis();
      expect(client.quit).toHaveBeenCalled();
      expect(subscriber.quit).toHaveBeenCalled();
    });

    it('does not throw when no connections exist', async () => {
      await expect(closeRedis()).resolves.not.toThrow();
    });

    it('does not throw when called multiple times', async () => {
      getRedisClient();
      await closeRedis();
      await expect(closeRedis()).resolves.not.toThrow();
    });
  });
});
