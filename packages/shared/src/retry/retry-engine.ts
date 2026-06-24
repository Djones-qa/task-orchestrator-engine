import type { RetryPolicy } from '../types.js';

/**
 * Maximum allowed retry delay in milliseconds (300 seconds).
 */
const MAX_DELAY_MS = 300000;

/**
 * Minimum allowed base delay in milliseconds.
 */
const MIN_BASE_DELAY = 100;

/**
 * Maximum allowed base delay in milliseconds.
 */
const MAX_BASE_DELAY = 300000;

/**
 * Minimum allowed max attempts.
 */
const MIN_MAX_ATTEMPTS = 1;

/**
 * Maximum allowed max attempts.
 */
const MAX_MAX_ATTEMPTS = 10;

export interface RetryPolicyValidationError {
  field: string;
  message: string;
  value: unknown;
}

/**
 * Validates a retry policy against constraints:
 * - maxAttempts must be between 1 and 10 (inclusive)
 * - baseDelay must be between 100 and 300000 ms (inclusive)
 * - strategy must be one of 'fixed', 'exponential', 'linear'
 *
 * @returns Array of validation errors (empty if valid)
 */
export function validateRetryPolicy(policy: RetryPolicy): RetryPolicyValidationError[] {
  const errors: RetryPolicyValidationError[] = [];

  const validStrategies: RetryPolicy['strategy'][] = ['fixed', 'exponential', 'linear'];
  if (!validStrategies.includes(policy.strategy)) {
    errors.push({
      field: 'strategy',
      message: `Strategy must be one of: ${validStrategies.join(', ')}`,
      value: policy.strategy,
    });
  }

  if (
    typeof policy.maxAttempts !== 'number' ||
    !Number.isInteger(policy.maxAttempts) ||
    policy.maxAttempts < MIN_MAX_ATTEMPTS ||
    policy.maxAttempts > MAX_MAX_ATTEMPTS
  ) {
    errors.push({
      field: 'maxAttempts',
      message: `maxAttempts must be an integer between ${MIN_MAX_ATTEMPTS} and ${MAX_MAX_ATTEMPTS}`,
      value: policy.maxAttempts,
    });
  }

  if (
    typeof policy.baseDelay !== 'number' ||
    !Number.isFinite(policy.baseDelay) ||
    policy.baseDelay < MIN_BASE_DELAY ||
    policy.baseDelay > MAX_BASE_DELAY
  ) {
    errors.push({
      field: 'baseDelay',
      message: `baseDelay must be a number between ${MIN_BASE_DELAY} and ${MAX_BASE_DELAY} ms`,
      value: policy.baseDelay,
    });
  }

  return errors;
}

/**
 * Calculates the retry delay for a given attempt number based on the retry policy strategy.
 *
 * Formulas:
 * - fixed: baseDelay
 * - exponential: min(baseDelay * 2^(attemptNumber - 1), 300000)
 * - linear: min(baseDelay * attemptNumber, 300000)
 *
 * @param policy - The retry policy configuration
 * @param attemptNumber - The current attempt number (1-based)
 * @returns The delay in milliseconds before the next retry
 */
export function calculateRetryDelay(policy: RetryPolicy, attemptNumber: number): number {
  switch (policy.strategy) {
    case 'fixed':
      return policy.baseDelay;
    case 'exponential':
      return Math.min(policy.baseDelay * Math.pow(2, attemptNumber - 1), MAX_DELAY_MS);
    case 'linear':
      return Math.min(policy.baseDelay * attemptNumber, MAX_DELAY_MS);
  }
}

/**
 * Determines whether a retry should be attempted based on the current attempt count
 * and the policy's maxAttempts limit.
 *
 * @param policy - The retry policy configuration
 * @param currentAttempt - The current attempt number (1-based, representing the attempt that just failed)
 * @returns true if another retry is allowed, false if maxAttempts has been reached
 */
export function shouldRetry(policy: RetryPolicy, currentAttempt: number): boolean {
  return currentAttempt < policy.maxAttempts;
}
