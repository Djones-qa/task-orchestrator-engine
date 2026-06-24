import { calculateRetryDelay, shouldRetry, validateRetryPolicy } from '../../../packages/shared/src/retry/retry-engine';
import type { RetryPolicy } from '../../../packages/shared/src/types';

describe('retry-engine', () => {
  describe('validateRetryPolicy', () => {
    it('returns no errors for a valid fixed policy', () => {
      const policy: RetryPolicy = { strategy: 'fixed', maxAttempts: 3, baseDelay: 1000 };
      expect(validateRetryPolicy(policy)).toEqual([]);
    });

    it('returns no errors for a valid exponential policy', () => {
      const policy: RetryPolicy = { strategy: 'exponential', maxAttempts: 5, baseDelay: 500 };
      expect(validateRetryPolicy(policy)).toEqual([]);
    });

    it('returns no errors for a valid linear policy', () => {
      const policy: RetryPolicy = { strategy: 'linear', maxAttempts: 10, baseDelay: 100 };
      expect(validateRetryPolicy(policy)).toEqual([]);
    });

    it('returns no errors at boundary values', () => {
      const policyMin: RetryPolicy = { strategy: 'fixed', maxAttempts: 1, baseDelay: 100 };
      const policyMax: RetryPolicy = { strategy: 'linear', maxAttempts: 10, baseDelay: 300000 };
      expect(validateRetryPolicy(policyMin)).toEqual([]);
      expect(validateRetryPolicy(policyMax)).toEqual([]);
    });

    it('returns error when maxAttempts is less than 1', () => {
      const policy: RetryPolicy = { strategy: 'fixed', maxAttempts: 0, baseDelay: 1000 };
      const errors = validateRetryPolicy(policy);
      expect(errors).toHaveLength(1);
      expect(errors[0].field).toBe('maxAttempts');
    });

    it('returns error when maxAttempts is greater than 10', () => {
      const policy: RetryPolicy = { strategy: 'fixed', maxAttempts: 11, baseDelay: 1000 };
      const errors = validateRetryPolicy(policy);
      expect(errors).toHaveLength(1);
      expect(errors[0].field).toBe('maxAttempts');
    });

    it('returns error when baseDelay is less than 100', () => {
      const policy: RetryPolicy = { strategy: 'fixed', maxAttempts: 3, baseDelay: 99 };
      const errors = validateRetryPolicy(policy);
      expect(errors).toHaveLength(1);
      expect(errors[0].field).toBe('baseDelay');
    });

    it('returns error when baseDelay is greater than 300000', () => {
      const policy: RetryPolicy = { strategy: 'fixed', maxAttempts: 3, baseDelay: 300001 };
      const errors = validateRetryPolicy(policy);
      expect(errors).toHaveLength(1);
      expect(errors[0].field).toBe('baseDelay');
    });

    it('returns error for invalid strategy', () => {
      const policy = { strategy: 'random' as any, maxAttempts: 3, baseDelay: 1000 };
      const errors = validateRetryPolicy(policy);
      expect(errors).toHaveLength(1);
      expect(errors[0].field).toBe('strategy');
    });

    it('returns multiple errors when multiple fields are invalid', () => {
      const policy = { strategy: 'invalid' as any, maxAttempts: 0, baseDelay: 50 };
      const errors = validateRetryPolicy(policy);
      expect(errors).toHaveLength(3);
    });
  });

  describe('calculateRetryDelay', () => {
    describe('fixed strategy', () => {
      it('returns baseDelay regardless of attempt number', () => {
        const policy: RetryPolicy = { strategy: 'fixed', maxAttempts: 5, baseDelay: 1000 };
        expect(calculateRetryDelay(policy, 1)).toBe(1000);
        expect(calculateRetryDelay(policy, 2)).toBe(1000);
        expect(calculateRetryDelay(policy, 5)).toBe(1000);
      });
    });

    describe('exponential strategy', () => {
      it('calculates delay as baseDelay * 2^(attempt-1)', () => {
        const policy: RetryPolicy = { strategy: 'exponential', maxAttempts: 5, baseDelay: 1000 };
        expect(calculateRetryDelay(policy, 1)).toBe(1000);   // 1000 * 2^0
        expect(calculateRetryDelay(policy, 2)).toBe(2000);   // 1000 * 2^1
        expect(calculateRetryDelay(policy, 3)).toBe(4000);   // 1000 * 2^2
        expect(calculateRetryDelay(policy, 4)).toBe(8000);   // 1000 * 2^3
        expect(calculateRetryDelay(policy, 5)).toBe(16000);  // 1000 * 2^4
      });

      it('caps delay at 300000ms', () => {
        const policy: RetryPolicy = { strategy: 'exponential', maxAttempts: 10, baseDelay: 100000 };
        expect(calculateRetryDelay(policy, 1)).toBe(100000);  // 100000 * 2^0
        expect(calculateRetryDelay(policy, 2)).toBe(200000);  // 100000 * 2^1
        expect(calculateRetryDelay(policy, 3)).toBe(300000);  // capped at 300000
        expect(calculateRetryDelay(policy, 4)).toBe(300000);  // capped at 300000
      });
    });

    describe('linear strategy', () => {
      it('calculates delay as baseDelay * attemptNumber', () => {
        const policy: RetryPolicy = { strategy: 'linear', maxAttempts: 5, baseDelay: 1000 };
        expect(calculateRetryDelay(policy, 1)).toBe(1000);   // 1000 * 1
        expect(calculateRetryDelay(policy, 2)).toBe(2000);   // 1000 * 2
        expect(calculateRetryDelay(policy, 3)).toBe(3000);   // 1000 * 3
        expect(calculateRetryDelay(policy, 4)).toBe(4000);   // 1000 * 4
        expect(calculateRetryDelay(policy, 5)).toBe(5000);   // 1000 * 5
      });

      it('caps delay at 300000ms', () => {
        const policy: RetryPolicy = { strategy: 'linear', maxAttempts: 10, baseDelay: 100000 };
        expect(calculateRetryDelay(policy, 1)).toBe(100000);  // 100000 * 1
        expect(calculateRetryDelay(policy, 2)).toBe(200000);  // 100000 * 2
        expect(calculateRetryDelay(policy, 3)).toBe(300000);  // capped at 300000
        expect(calculateRetryDelay(policy, 4)).toBe(300000);  // capped at 300000
      });
    });
  });

  describe('shouldRetry', () => {
    it('returns true when currentAttempt is less than maxAttempts', () => {
      const policy: RetryPolicy = { strategy: 'fixed', maxAttempts: 3, baseDelay: 1000 };
      expect(shouldRetry(policy, 1)).toBe(true);
      expect(shouldRetry(policy, 2)).toBe(true);
    });

    it('returns false when currentAttempt equals maxAttempts', () => {
      const policy: RetryPolicy = { strategy: 'fixed', maxAttempts: 3, baseDelay: 1000 };
      expect(shouldRetry(policy, 3)).toBe(false);
    });

    it('returns false when currentAttempt exceeds maxAttempts', () => {
      const policy: RetryPolicy = { strategy: 'fixed', maxAttempts: 3, baseDelay: 1000 };
      expect(shouldRetry(policy, 4)).toBe(false);
    });

    it('returns false when maxAttempts is 1 (no retries allowed)', () => {
      const policy: RetryPolicy = { strategy: 'fixed', maxAttempts: 1, baseDelay: 1000 };
      expect(shouldRetry(policy, 1)).toBe(false);
    });
  });
});
