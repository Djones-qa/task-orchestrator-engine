import type { TaskStatus } from '../types.js';

/**
 * Audit entry recorded on every successful state transition.
 */
export interface TransitionAuditEntry {
  taskId: string;
  previousState: TaskStatus;
  newState: TaskStatus;
  timestamp: Date;
}

/**
 * Successful transition result.
 */
export interface TransitionSuccess {
  success: true;
  auditEntry: TransitionAuditEntry;
}

/**
 * Failed transition result with diagnostic details.
 */
export interface TransitionError {
  success: false;
  error: {
    message: string;
    currentState: TaskStatus;
    attemptedState: TaskStatus;
    taskId: string;
  };
}

export type TransitionResult = TransitionSuccess | TransitionError;

/**
 * Terminal states — once a task enters one of these, no further transitions are allowed.
 */
const TERMINAL_STATES: ReadonlySet<TaskStatus> = new Set<TaskStatus>([
  'completed',
  'failed',
  'cancelled',
  'timed_out',
]);

/**
 * Valid state transitions map.
 * Key: current state. Value: set of states that can be transitioned to.
 */
const VALID_TRANSITIONS: ReadonlyMap<TaskStatus, ReadonlySet<TaskStatus>> = new Map<TaskStatus, ReadonlySet<TaskStatus>>([
  ['pending', new Set<TaskStatus>(['running', 'cancelled'])],
  ['running', new Set<TaskStatus>(['completed', 'failed', 'cancelled', 'timed_out'])],
]);

/**
 * Check whether a task status is a terminal state.
 * Terminal states: completed, failed, cancelled, timed_out.
 */
export function isTerminalState(state: TaskStatus): boolean {
  return TERMINAL_STATES.has(state);
}

/**
 * Attempt a state transition for a task.
 *
 * Returns a structured result:
 * - On success: `{ success: true, auditEntry }` with the recorded audit entry
 * - On failure: `{ success: false, error }` with current state, attempted state, and task identifier
 *
 * @param currentState - The task's current state
 * @param targetState  - The desired new state
 * @param taskId       - The task identifier (for audit and error reporting)
 */
export function transition(
  currentState: TaskStatus,
  targetState: TaskStatus,
  taskId: string,
): TransitionResult {
  // Check if task is already in a terminal state
  if (isTerminalState(currentState)) {
    return {
      success: false,
      error: {
        message: `Task ${taskId} is already in terminal state '${currentState}'; cannot transition to '${targetState}'`,
        currentState,
        attemptedState: targetState,
        taskId,
      },
    };
  }

  // Check if the transition is valid
  const allowedTargets = VALID_TRANSITIONS.get(currentState);
  if (!allowedTargets || !allowedTargets.has(targetState)) {
    return {
      success: false,
      error: {
        message: `Invalid state transition from '${currentState}' to '${targetState}' for task ${taskId}`,
        currentState,
        attemptedState: targetState,
        taskId,
      },
    };
  }

  // Transition is valid — create audit entry
  const auditEntry: TransitionAuditEntry = {
    taskId,
    previousState: currentState,
    newState: targetState,
    timestamp: new Date(),
  };

  return {
    success: true,
    auditEntry,
  };
}
