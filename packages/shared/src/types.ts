// Core Domain Types

export interface Workflow {
  id: string;
  name: string;
  description?: string;
  taskDefinitions: TaskDefinition[];
  edges: Edge[];
  triggerConfig: TriggerConfig;
  createdAt: Date;
  updatedAt: Date;
}

export interface TaskDefinition {
  id: string;
  workflowId: string;
  name: string;
  type: string;
  config: Record<string, unknown>;
  timeoutMs: number;
  retryPolicy?: RetryPolicy;
}

export interface Edge {
  id: string;
  workflowId: string;
  sourceTaskId: string;
  targetTaskId: string;
  conditionExpr?: string;
}

export interface RetryPolicy {
  strategy: 'fixed' | 'exponential' | 'linear';
  maxAttempts: number;  // 1-10
  baseDelay: number;    // 100-300000 ms
}

export interface Execution {
  id: string;
  workflowId: string;
  status: ExecutionStatus;
  input?: Record<string, unknown>;
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
}

export type ExecutionStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface TaskState {
  id: string;
  executionId: string;
  taskDefinitionId: string;
  status: TaskStatus;
  attemptCount: number;
  output?: Record<string, unknown>;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
}

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'timed_out' | 'skipped';

export interface TriggerConfig {
  type: 'manual' | 'schedule' | 'webhook' | 'event';
  scheduleId?: string;
  eventPattern?: string;
}

export interface Schedule {
  id: string;
  workflowId: string;
  cronExpr?: string;
  intervalMs?: number;
  timezone: string;
  active: boolean;
  lastRunAt?: Date;
  nextRunAt?: Date;
  createdAt: Date;
}

export interface WebhookRegistration {
  id: string;
  workflowId: string;
  secret?: string;
  active: boolean;
  createdAt: Date;
}

export interface SLAConfig {
  id: string;
  workflowId: string;
  maxDurationMs: number;
  warningThresholdPct: number;
}

export interface Alert {
  id: string;
  executionId: string;
  workflowId: string;
  severity: 'warning' | 'critical';
  message: string;
  elapsedMs: number;
  slaLimitMs: number;
  resolved: boolean;
  resolvedAt?: Date;
  createdAt: Date;
}

export interface ExecutorHeartbeat {
  executorId: string;
  timestamp: Date;
  currentTaskCount: number;
  maxCapacity: number;
}

export interface ExecutionMetrics {
  activeExecutionCount: number;
  successRatePct: number;       // over last 60 minutes
  avgDurationMs: number;        // over last 60 minutes
  throughputPerMinute: number;  // completed per minute over last 60 minutes
}
