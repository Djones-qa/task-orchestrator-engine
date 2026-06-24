# Implementation Plan: Task Orchestrator Engine

## Overview

This plan implements a distributed task orchestration platform with four TypeScript/Node.js microservices (Scheduler API, Executor Service, Webhook Gateway, Monitor Service) backed by PostgreSQL and Redis. Tasks follow a dependency order: shared foundations first, then core algorithms, data layer, individual services, testing, and infrastructure.

## Tasks

- [x] 1. Project setup and monorepo structure
  - [x] 1.1 Initialize monorepo with shared workspace configuration
    - Create root `package.json` with npm workspaces pointing to `packages/shared`, `services/scheduler-api`, `services/executor-service`, `services/webhook-gateway`, `services/monitor-service`
    - Create root `tsconfig.base.json` with TypeScript 5.3, ES2022 target, strict mode, composite project references
    - Create `.nvmrc` with Node.js 20
    - Install shared dev dependencies: `typescript`, `jest`, `ts-jest`, `@types/jest`, `fast-check`, `eslint`, `prettier`
    - _Requirements: 14.1, 15.1_

  - [x] 1.2 Create shared types package
    - Create `packages/shared/package.json` and `packages/shared/tsconfig.json`
    - Implement all TypeScript interfaces from design: `Workflow`, `TaskDefinition`, `Edge`, `RetryPolicy`, `Execution`, `ExecutionStatus`, `TaskState`, `TaskStatus`, `TriggerConfig`, `Schedule`, `WebhookRegistration`, `SLAConfig`, `Alert`, `ExecutorHeartbeat`, `ExecutionMetrics`
    - Export all types from `packages/shared/src/index.ts`
    - _Requirements: 1.1, 3.1, 4.1, 7.5, 9.1_

  - [x] 1.3 Set up service scaffolding for all four services
    - For each service (`scheduler-api`, `executor-service`, `webhook-gateway`, `monitor-service`): create `package.json`, `tsconfig.json`, `src/index.ts`, `src/app.ts` with Express setup and `/health` endpoint
    - Install per-service dependencies: `express`, `@types/express`, `pg`, `ioredis`, `uuid`
    - Configure ports: 5000, 5001, 5002, 5003 respectively
    - _Requirements: 14.1_

  - [x] 1.4 Set up test framework configuration
    - Create root `jest.config.ts` with project references for each service and shared package
    - Configure `ts-jest` transform, test path patterns for `unit/`, `property/`, `integration/` directories
    - Install `fast-check` for property-based testing, `testcontainers` for integration tests
    - Create `tests/` directory structure: `tests/unit/`, `tests/property/`, `tests/integration/`
    - _Requirements: 15.2, 16.1_

- [x] 2. Core algorithms implementation
  - [x] 2.1 Implement DAG validator with cycle detection
    - Create `packages/shared/src/dag/dag-validator.ts`
    - Implement `buildAdjacencyList(tasks, edges)` helper
    - Implement DFS-based cycle detection using white/gray/black coloring
    - Implement `validateEdgeReferences(tasks, edges)` to check all edge source/target IDs exist
    - Implement `checkReachability(tasks, edges)` using BFS from root nodes
    - Implement `validateDAG(tasks, edges)` orchestrating all three checks, returning structured errors identifying nodes in cycles, invalid edges, or unreachable nodes
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [ ]* 2.2 Write property tests for DAG cycle detection (Property 1)
    - **Property 1: DAG Cycle Detection Correctness**
    - Create custom `dagArbitrary` generator producing acyclic graphs (1-50 nodes, edges only from lower to higher index)
    - Create `cyclicGraphArbitrary` generator injecting back-edges into valid DAGs
    - Assert: all acyclic graphs accepted, all cyclic graphs rejected
    - Minimum 100 iterations
    - **Validates: Requirements 2.1, 2.2, 16.1**

  - [x] 2.3 Implement topological sort
    - Create `packages/shared/src/dag/topological-sorter.ts`
    - Implement DFS-based topological sort producing reverse post-order
    - Return ordered array of task definition IDs
    - Integrate with `validateDAG` so validation and sort happen in a single DFS pass
    - _Requirements: 2.1_

  - [ ]* 2.4 Write property tests for topological sort (Property 2)
    - **Property 2: Topological Sort Ordering Validity**
    - For any valid DAG, assert output contains exactly the same node IDs as input
    - For every edge (u, v), assert u appears before v in the ordering
    - Minimum 100 iterations
    - **Validates: Requirements 2.1, 16.2**

  - [ ]* 2.5 Write property tests for DAG reachability (Property 3)
    - **Property 3: DAG Reachability from Roots**
    - For any valid DAG accepted by the validator, assert all nodes are reachable from at least one root node via directed edges
    - Minimum 100 iterations
    - **Validates: Requirements 2.5**

  - [x] 2.6 Implement DAG serialization and deserialization
    - Create `packages/shared/src/dag/dag-serializer.ts`
    - Implement `serialize(tasks, edges)` producing canonical form (tasks sorted by ID, edges sorted by sourceTaskId then targetTaskId)
    - Implement `deserialize(serialized)` reconstructing the graph from canonical form
    - _Requirements: 2.6_

  - [ ]* 2.7 Write property tests for DAG round-trip (Property 4)
    - **Property 4: DAG Serialization Round-Trip**
    - For any valid DAG, `deserialize(serialize(dag))` produces identical task IDs and identical edges
    - Minimum 100 iterations
    - **Validates: Requirements 2.6**

  - [x] 2.8 Implement task state machine
    - Create `packages/shared/src/state-machine/state-machine.ts`
    - Define valid transitions map: `{pending→running, running→completed, running→failed, running→cancelled, running→timed_out, pending→cancelled}`
    - Implement `transition(currentState, targetState)` returning success or error with current state, attempted state, and task identifier
    - Implement `isTerminalState(state)` for `{completed, failed, cancelled, timed_out}`
    - Implement audit entry creation on successful transitions (taskId, previousState, newState, timestamp)
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [ ]* 2.9 Write property tests for state machine (Property 5)
    - **Property 5: Task State Machine Transition Validity**
    - Generate all pairs of (currentState, targetState) from the 6 states
    - Assert: valid transitions accepted AND produce audit entries, invalid transitions rejected AND state unchanged
    - Minimum 100 iterations
    - **Validates: Requirements 4.2, 4.3, 4.4, 4.5, 16.4**

  - [x] 2.10 Implement retry delay engine
    - Create `packages/shared/src/retry/retry-engine.ts`
    - Implement `calculateRetryDelay(policy, attemptNumber)` with exact formulas: fixed=baseDelay, exponential=min(baseDelay*2^(attempt-1), 300000), linear=min(baseDelay*attempt, 300000)
    - Implement `shouldRetry(policy, currentAttempt)` checking against maxAttempts
    - Validate policy constraints: maxAttempts 1-10, baseDelay 100-300000ms
    - _Requirements: 7.1, 7.2, 7.3, 7.5_

  - [ ]* 2.11 Write property tests for retry delay calculation (Property 6)
    - **Property 6: Retry Delay Formula Correctness**
    - Generate random retry policies (strategy in {fixed, exponential, linear}, maxAttempts 1-10, baseDelay 100-60000)
    - For each attempt number in [1, maxAttempts], assert computed delay exactly matches formula
    - Minimum 100 iterations
    - **Validates: Requirements 7.1, 7.2, 7.3, 16.3**

  - [x] 2.12 Implement cron expression parser and next-run calculator
    - Create `packages/shared/src/scheduling/cron-evaluator.ts`
    - Implement 5-field cron parser (minute, hour, day-of-month, month, day-of-week)
    - Implement `getNextRunTime(cronExpr, referenceTimestamp, timezone)` using field-by-field forward scan
    - Ensure result is always strictly greater than reference timestamp
    - Support timezone via `Intl.DateTimeFormat` or a lightweight library
    - _Requirements: 9.1, 9.2, 9.6_

  - [ ]* 2.13 Write property tests for cron next-run (Property 8)
    - **Property 8: Cron Next-Run Monotonicity**
    - Generate random valid 5-field cron expressions and random reference timestamps
    - Assert: computed next run time is strictly greater than reference timestamp
    - Minimum 100 iterations
    - **Validates: Requirements 9.6, 16.6**

  - [x] 2.14 Implement HMAC-SHA256 validation utility
    - Create `packages/shared/src/security/hmac-validator.ts`
    - Implement `computeSignature(payload, secret)` using `crypto.createHmac('sha256', secret)`
    - Implement `validateSignature(payload, signatureHeader, secret)` with `crypto.timingSafeEqual`
    - Handle `sha256=` prefix stripping from signature header
    - _Requirements: 11.2, 11.3_

  - [ ]* 2.15 Write property tests for HMAC validation (Property 9)
    - **Property 9: HMAC-SHA256 Webhook Signature Validation**
    - Generate random payloads and secrets, compute HMAC, assert validation succeeds
    - Modify single byte of payload or signature, assert validation fails
    - Minimum 100 iterations
    - **Validates: Requirements 11.2, 11.3**

- [x] 3. Checkpoint - Core algorithms verified
  - Ensure all unit tests and property tests for core algorithms pass, ask the user if questions arise.

- [ ] 4. Database layer (PostgreSQL)
  - [-] 4.1 Create database migrations
    - Create `packages/shared/src/db/migrations/` directory
    - Implement migration 001: `workflows`, `task_definitions`, `edges` tables with indexes
    - Implement migration 002: `executions`, `task_states`, `task_state_audit` tables with indexes
    - Implement migration 003: `schedules`, `webhook_registrations` tables with indexes
    - Implement migration 004: `dead_letter_queue`, `sla_configs`, `alerts` tables with indexes
    - Use SQL schemas exactly as defined in the design document
    - Set up migration runner (e.g., `node-pg-migrate` or raw SQL execution on startup)
    - _Requirements: 1.1, 3.1, 9.1, 11.1, 12.1, 13.5_

  - [-] 4.2 Implement database connection pool
    - Create `packages/shared/src/db/pool.ts`
    - Configure `pg.Pool` with connection string from environment variable `DATABASE_URL`
    - Implement graceful shutdown for pool cleanup
    - _Requirements: 14.1_

  - [ ] 4.3 Implement workflow repository
    - Create `services/scheduler-api/src/repositories/workflow-repository.ts`
    - Implement `create(workflow)` — insert workflow, task_definitions, edges in a transaction
    - Implement `findById(id)` — fetch workflow with task_definitions and edges via JOINs
    - Implement `findAll(page, pageSize)` — paginated list (default 20, max 100)
    - Implement `update(id, workflow)` — replace task_definitions and edges in a transaction
    - Implement `delete(id)` — delete workflow (cascade deletes task_definitions and edges)
    - Implement `hasActiveExecutions(id)` — check for pending/running executions
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.7_

  - [ ] 4.4 Implement execution repository
    - Create `services/scheduler-api/src/repositories/execution-repository.ts`
    - Implement `create(workflowId, input)` — insert execution with pending status
    - Implement `findById(id)` — fetch execution with all TaskState records
    - Implement `updateStatus(id, status, timestamp)` — update execution status
    - Implement `findByWorkflowId(workflowId, status?)` — find executions by workflow, optionally filtered by status
    - _Requirements: 3.1, 3.3, 3.4, 3.5_

  - [ ] 4.5 Implement task state repository
    - Create `services/scheduler-api/src/repositories/task-state-repository.ts`
    - Implement `createBatch(executionId, taskDefinitions)` — bulk insert TaskState records in pending status
    - Implement `findByExecutionId(executionId)` — fetch all task states for an execution
    - Implement `updateStatus(id, status, output?, error?)` — update task state with timestamps
    - Implement `createAuditEntry(taskStateId, previousState, newState)` — insert audit log
    - _Requirements: 3.1, 3.2, 4.5_

  - [ ] 4.6 Implement schedule repository
    - Create `services/scheduler-api/src/repositories/schedule-repository.ts`
    - Implement CRUD operations for schedules
    - Implement `findActive()` — fetch all active schedules with next_run_at
    - Implement `findDue(now)` — find schedules where next_run_at <= now
    - Implement `updateNextRun(id, nextRunAt, lastRunAt)` — update run timestamps
    - _Requirements: 9.1, 9.2, 9.3, 9.5, 9.9_

  - [ ] 4.7 Implement webhook registration and DLQ repositories
    - Create `services/scheduler-api/src/repositories/webhook-repository.ts` with CRUD for webhook registrations
    - Create `services/scheduler-api/src/repositories/dlq-repository.ts` with `insert(taskStateId, executionId, error, attempts)` and `findAll(page, pageSize)`
    - _Requirements: 10.3, 7.4_

  - [ ] 4.8 Implement SLA config and alert repositories
    - Create `services/monitor-service/src/repositories/sla-config-repository.ts` with `create(config)` and `findByWorkflowId(workflowId)`
    - Create `services/monitor-service/src/repositories/alert-repository.ts` with `create(alert)`, `findRecent(hours, limit)`, `resolve(alertId, timestamp)`
    - _Requirements: 13.1, 13.4, 13.5, 13.6_

- [ ] 5. Redis layer
  - [-] 5.1 Implement Redis connection and utilities
    - Create `packages/shared/src/redis/redis-client.ts`
    - Configure `ioredis` client with connection string from environment variable `REDIS_URL`
    - Implement graceful disconnect on shutdown
    - _Requirements: 5.1, 14.1_

  - [-] 5.2 Implement task queue operations
    - Create `packages/shared/src/redis/task-queue.ts`
    - Implement `enqueue(taskStateId)` using `LPUSH task_queue`
    - Implement `enqueueBatch(taskStateIds)` using multi/pipeline for atomic fan-out
    - Implement `claim(executorId, timeout)` using `BRPOPLPUSH task_queue task_processing 5`
    - Implement `requeue(taskStateId)` — remove from processing, push to task_queue
    - Implement `removeFromProcessing(taskStateId)` using `LREM`
    - _Requirements: 5.1, 5.2, 6.2_

  - [-] 5.3 Implement distributed lock manager
    - Create `packages/shared/src/redis/lock-manager.ts`
    - Implement `acquire(taskStateId, executorId, ttlMs=30000)` using `SET key executorId NX PX 30000`
    - Implement `renew(taskStateId, executorId, ttlMs=30000)` using Lua script that checks ownership before extending TTL
    - Implement `release(taskStateId, executorId)` using Lua script that checks ownership before DEL
    - Implement `isHeld(taskStateId)` to check lock existence
    - Store executor ID as lock value for ownership tracking
    - _Requirements: 5.3, 5.4, 5.5, 5.6, 8.2_

  - [ ]* 5.4 Write property tests for distributed lock claiming (Property 7)
    - **Property 7: Distributed Task Claiming Exactly-Once Semantics**
    - Simulate 2-10 concurrent executors attempting to claim the same task using mock Redis
    - Assert: exactly one executor successfully acquires the lock
    - Assert: no two executors both believe they hold the lock
    - Minimum 100 iterations
    - **Validates: Requirements 5.7, 16.5**

  - [ ] 5.5 Implement heartbeat operations
    - Create `packages/shared/src/redis/heartbeat-store.ts`
    - Implement `send(executorId, taskCount, maxCapacity)` — HSET heartbeat:{executorId} with 90s TTL
    - Implement `get(executorId)` — HGETALL heartbeat:{executorId}
    - Implement `getAll()` — SCAN for heartbeat:* keys and return all
    - Implement `isHealthy(executorId, thresholdMs=90000)` — check if heartbeat timestamp is within threshold
    - _Requirements: 8.1, 8.3_

  - [ ] 5.6 Implement metrics cache
    - Create `packages/shared/src/redis/metrics-cache.ts`
    - Implement `setMetrics(metrics)` — SET metrics:cache with 10s TTL
    - Implement `getMetrics()` — GET metrics:cache, parse JSON
    - _Requirements: 12.3_

  - [ ] 5.7 Implement Redis pub/sub for task events
    - Create `packages/shared/src/redis/event-bus.ts`
    - Implement `publishTaskCompleted(taskStateId, executionId)` on channel `channel:task.completed`
    - Implement `publishTaskFailed(taskStateId, executionId)` on channel `channel:task.failed`
    - Implement `subscribe(channel, handler)` for subscribing to events
    - _Requirements: 3.3, 3.4, 6.1_

- [ ] 6. Checkpoint - Data layer verified
  - Ensure all database and Redis layer code compiles and unit tests pass, ask the user if questions arise.

- [ ] 7. Scheduler API service
  - [ ] 7.1 Implement workflow CRUD routes and controllers
    - Create `services/scheduler-api/src/routes/workflow-routes.ts`
    - Create `services/scheduler-api/src/controllers/workflow-controller.ts`
    - Implement POST /api/v1/workflows — validate body, run DAG validation, persist, return 201
    - Implement GET /api/v1/workflows — paginated list with default page size 20, max 100
    - Implement GET /api/v1/workflows/:id — return full workflow or 404
    - Implement PUT /api/v1/workflows/:id — validate body, run DAG validation, persist, return 200
    - Implement DELETE /api/v1/workflows/:id — check active executions (409 if active), delete, return 204
    - Add request validation middleware for workflow payloads
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 2.1, 2.2, 2.3, 2.4, 2.5_

  - [ ] 7.2 Implement execution lifecycle controller
    - Create `services/scheduler-api/src/controllers/execution-controller.ts`
    - Create `services/scheduler-api/src/routes/execution-routes.ts`
    - Implement POST /api/v1/workflows/:id/execute — create execution (pending), create TaskStates, enqueue root tasks, transition to running, return 202
    - Implement GET /api/v1/executions/:id — return execution with TaskStates or 404
    - Implement POST /api/v1/executions/:id/cancel — transition to cancelled, cancel pending tasks, enqueue cancellation for running tasks, handle 404/409
    - _Requirements: 3.1, 3.5, 3.6, 3.7, 3.8, 3.9_

  - [ ] 7.3 Implement execution completion detection
    - Create `services/scheduler-api/src/services/execution-manager.ts`
    - Subscribe to `channel:task.completed` and `channel:task.failed` events
    - On task completion: check if all tasks in execution are in terminal state → transition execution to completed
    - On task failure (after retries exhausted): check if execution should fail (no alternative paths for downstream tasks) → transition execution to failed
    - Record completion/failure timestamps
    - _Requirements: 3.3, 3.4_

  - [ ] 7.4 Implement schedule management routes
    - Create `services/scheduler-api/src/routes/schedule-routes.ts`
    - Create `services/scheduler-api/src/controllers/schedule-controller.ts`
    - Implement POST /api/v1/schedules — validate cron/interval, validate workflow exists, compute nextRunAt, return 201
    - Implement GET /api/v1/schedules — paginated list (default 50, max 100) with next_run_at
    - Implement PATCH /api/v1/schedules/:id — update active status
    - Validate: cron expression format, interval range (1000-86400000ms), workflow existence
    - Return 422 for invalid cron, out-of-range interval, or non-existent workflow
    - _Requirements: 9.1, 9.5, 9.7, 9.9_

  - [ ] 7.5 Implement schedule evaluation loop
    - Create `services/scheduler-api/src/services/schedule-evaluator.ts`
    - Implement periodic poll (every 5 seconds) for due schedules
    - For each due schedule: create workflow execution, update lastRunAt and nextRunAt
    - Handle missed runs on recovery: detect and execute only the most recent missed run within 60s
    - Handle schedule with deleted workflow: mark schedule as failed
    - _Requirements: 9.2, 9.3, 9.4, 9.8_

  - [ ] 7.6 Implement trigger configuration handling
    - Create `services/scheduler-api/src/services/trigger-manager.ts`
    - On workflow create/update with trigger type "webhook": generate unique webhook URL, create WebhookRegistration record
    - On workflow create/update with trigger type "schedule": validate and associate schedule
    - On workflow create/update with trigger type "event": subscribe to event pattern
    - Validate trigger types ("manual", "schedule", "webhook", "event"), return 400 for invalid type
    - Return 422 for non-existent schedule reference
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6_

  - [ ] 7.7 Implement orphan task detection and re-enqueue
    - Create `services/scheduler-api/src/services/orphan-detector.ts`
    - Poll Redis `task_processing` list every 60 seconds
    - For each entry, check if the corresponding distributed lock has expired
    - Re-enqueue orphaned tasks to `task_queue`
    - Handle unhealthy executor cleanup: release all locks held by unhealthy executor, reset task states to pending preserving attempt count, re-enqueue with 3 retry attempts on failure
    - _Requirements: 5.8, 8.4, 8.5_

  - [ ]* 7.8 Write unit tests for Scheduler API controllers
    - Test workflow CRUD responses, status codes, error formats
    - Test execution lifecycle state transitions
    - Test schedule validation edge cases
    - Test trigger configuration validation
    - _Requirements: 1.1-1.7, 3.1-3.9, 9.1-9.9, 10.1-10.6_

- [ ] 8. Executor Service
  - [ ] 8.1 Implement task claimer with polling loop
    - Create `services/executor-service/src/services/task-claimer.ts`
    - Implement polling loop: `BRPOPLPUSH` with 5s timeout → acquire lock via SETNX → on failure re-enqueue and retry
    - Track current task assignment; only claim when no task is active
    - Start lock renewal interval (every 10 seconds) upon successful claim
    - On lock renewal failure: abort task execution, do not persist partial results
    - _Requirements: 5.2, 5.3, 5.4, 5.5, 5.6_

  - [ ] 8.2 Implement task runner with timeout enforcement
    - Create `services/executor-service/src/services/task-runner.ts`
    - Execute task based on task definition type and config
    - Enforce timeout from TaskDefinition.timeoutMs (default 300000ms)
    - On timeout: transition task to `timed_out`, release lock
    - On success: transition to `completed`, record output, release lock
    - On failure: delegate to retry engine
    - _Requirements: 4.1, 4.2, 5.6_

  - [ ] 8.3 Implement retry handling in executor
    - Create `services/executor-service/src/services/retry-handler.ts`
    - On task failure with RetryPolicy configured: calculate delay, wait, re-execute
    - Maintain distributed lock during retry delay period
    - On success during retry: transition to completed, record attempt count
    - On exhausting all attempts: move to Dead Letter Queue, transition to failed
    - On failure with no RetryPolicy: transition to failed immediately
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.6, 7.7, 7.8_

  - [ ] 8.4 Implement fan-out/fan-in downstream evaluation
    - Create `services/executor-service/src/services/fan-out-fan-in.ts`
    - On task completion: evaluate all outgoing edges within 1 second
    - For edges with no condition: enqueue all downstream tasks atomically (pipeline LPUSH)
    - For edges with condition: evaluate expression against upstream output, enqueue if true, mark skipped if false
    - Fan-in logic: only enqueue downstream task when ALL incoming edges are satisfied (all upstream in terminal state, at least one completed)
    - Handle condition evaluation errors: treat as false, log error with edge ID and expression
    - Propagate skipped status through downstream tasks with no other satisfiable path
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7_

  - [ ] 8.5 Implement heartbeat emitter
    - Create `services/executor-service/src/services/heartbeat-emitter.ts`
    - Send initial heartbeat within 5 seconds of startup
    - Send heartbeat every 30 seconds with executor ID, timestamp, current task count, max capacity
    - Store heartbeat in Redis hash with 90s TTL
    - _Requirements: 8.1, 8.2_

  - [ ] 8.6 Wire executor service startup
    - Update `services/executor-service/src/index.ts`
    - Initialize Redis and PostgreSQL connections
    - Start heartbeat emitter
    - Start task claimer polling loop
    - Register graceful shutdown: release locks, stop heartbeat, close connections
    - _Requirements: 8.1_

  - [ ]* 8.7 Write unit tests for Executor Service components
    - Test task claimer with mocked Redis (claim success, lock failure, re-enqueue)
    - Test retry handler delay calculations and attempt counting
    - Test fan-out/fan-in edge evaluation logic
    - Test state machine integration with task runner
    - _Requirements: 5.2-5.7, 6.1-6.7, 7.1-7.8_

- [ ] 9. Webhook Gateway service
  - [ ] 9.1 Implement webhook ingestion endpoint
    - Create `services/webhook-gateway/src/routes/webhook-routes.ts`
    - Create `services/webhook-gateway/src/controllers/webhook-controller.ts`
    - Implement POST /api/v1/webhooks/:id — validate webhook ID exists, validate payload, validate signature if secret registered, forward to Scheduler API, return 202 with execution ID
    - _Requirements: 11.1, 11.5_

  - [ ] 9.2 Implement payload and signature validation middleware
    - Create `services/webhook-gateway/src/middleware/payload-validator.ts`
    - Validate request body is well-formed JSON and does not exceed 1 MB
    - Return 400 for invalid JSON or oversized payload with descriptive error message
    - Create `services/webhook-gateway/src/middleware/hmac-validator.ts`
    - If webhook has registered secret: validate HMAC-SHA256 signature from header
    - Return 401 for missing or invalid signature (no details to prevent information leakage)
    - _Requirements: 11.2, 11.3, 11.7_

  - [ ] 9.3 Implement webhook forwarding to Scheduler API
    - Create `services/webhook-gateway/src/services/webhook-forwarder.ts`
    - Forward validated webhook payload to Scheduler API POST /api/v1/workflows/:id/execute
    - Return 404 for unknown webhook IDs
    - Return 502 if Scheduler API is unavailable or returns error
    - Target 500ms p95 processing time
    - _Requirements: 11.1, 11.4, 11.5, 11.6, 11.8_

  - [ ]* 9.4 Write unit tests for Webhook Gateway
    - Test HMAC validation success and failure cases
    - Test payload size and format validation
    - Test forwarding with mocked Scheduler API (success, unavailable, error)
    - Test 404 for unknown webhook IDs
    - _Requirements: 11.1-11.8_

- [ ] 10. Monitor Service
  - [ ] 10.1 Implement metrics aggregation endpoint
    - Create `services/monitor-service/src/controllers/metrics-controller.ts`
    - Create `services/monitor-service/src/routes/monitor-routes.ts`
    - Implement GET /api/v1/monitor/metrics — compute active execution count, success rate (last 60min), average duration (last 60min), throughput (completed/min over last 60min)
    - Check Redis cache first (10s TTL); compute from PostgreSQL if cache miss
    - Return zero-value metrics if no data exists (never error)
    - _Requirements: 12.1, 12.3, 12.5_

  - [ ] 10.2 Implement executor health endpoint
    - Create `services/monitor-service/src/services/executor-health-tracker.ts`
    - Implement GET /api/v1/monitor/executors — return health status, current task count, max capacity for all registered executors from Redis heartbeats
    - Detect unhealthy executors (no heartbeat within 90s): mark unhealthy, trigger reassignment via Scheduler API
    - Return empty list if no executors registered (not an error)
    - _Requirements: 12.2, 8.3, 12.5_

  - [ ] 10.3 Implement dashboard endpoint
    - Implement GET /api/v1/monitor/dashboard — aggregate execution metrics, executor health, and up to 50 most recent alerts from last 24 hours sorted by timestamp descending
    - Respond within 2000ms
    - _Requirements: 12.4, 12.6_

  - [ ] 10.4 Implement SLA tracking and alerting
    - Create `services/monitor-service/src/services/sla-checker.ts`
    - Poll running executions every 5 seconds against SLA configurations
    - Emit warning alert when elapsed time exceeds warning threshold (default 80%) of max duration
    - Emit critical alert when elapsed time exceeds max duration, mark execution as breaching SLA
    - Resolve alerts when breaching execution completes or is cancelled
    - Create `services/monitor-service/src/services/alert-manager.ts`
    - Implement alert storage, retrieval (last 24 hours, max 200, sorted by severity then timestamp desc)
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.6_

  - [ ] 10.5 Implement SLA config and alerts endpoints
    - Implement POST /api/v1/monitor/sla-configs — validate workflow exists, maxDurationMs >= 1000, return 201
    - Implement GET /api/v1/monitor/alerts — return active and recent alerts (last 24h, max 200)
    - _Requirements: 13.4, 13.5_

  - [ ]* 10.6 Write unit tests for Monitor Service
    - Test metrics aggregation with known data sets
    - Test SLA threshold calculations (warning at 80%, critical at 100%)
    - Test alert creation, resolution, and retrieval
    - Test executor health detection with mocked heartbeat data
    - _Requirements: 12.1-12.6, 13.1-13.6_

- [ ] 11. Checkpoint - All services implemented
  - Ensure all four services compile, unit tests pass, and TypeScript has no errors, ask the user if questions arise.

- [ ] 12. Integration tests
  - [ ]* 12.1 Write integration test for end-to-end workflow execution
    - Use testcontainers-node to spin up PostgreSQL and Redis containers
    - Create a workflow with 3+ task definitions and dependencies via API
    - Execute the workflow and wait for all tasks to reach completed status
    - Assert final execution status is completed and individual TaskState records are correct
    - Timeout: 60 seconds
    - _Requirements: 17.1_

  - [ ]* 12.2 Write integration test for fan-out/fan-in execution
    - Create workflow with 3+ concurrent fan-out tasks and 1 fan-in task
    - Execute and verify all fan-out tasks run (not blocked by each other)
    - Verify fan-in task executes only after all upstream tasks complete
    - _Requirements: 17.2_

  - [ ]* 12.3 Write integration test for retry behavior
    - Test all three retry strategies (fixed, exponential, linear) with actual delays
    - Use tasks that fail intentionally for N-1 attempts then succeed
    - Assert attempt count matches configured maxAttempts
    - Assert inter-attempt delays conform to strategy formula (with tolerance)
    - Timeout: 30 seconds per scenario
    - _Requirements: 17.3_

  - [ ]* 12.4 Write integration test for webhook-triggered execution
    - Send HTTP POST to Webhook Gateway with valid payload and HMAC signature
    - Assert 202 response with execution ID
    - Wait for execution to complete, verify all tasks reach terminal state
    - _Requirements: 17.4_

  - [ ]* 12.5 Write integration test for schedule-triggered execution
    - Create a schedule with a cron expression
    - Simulate time advancement to match cron expression
    - Assert workflow execution is created at the scheduled time
    - _Requirements: 17.5_

  - [ ]* 12.6 Write integration test for failure propagation and DLQ
    - Create workflow with a task configured to always fail (maxAttempts: 2)
    - Execute and wait for task to exhaust retries
    - Assert task is moved to Dead Letter Queue
    - Assert execution transitions to failed status
    - _Requirements: 17.6_

- [ ] 13. Infrastructure and deployment
  - [ ] 13.1 Create Dockerfiles for all services
    - Create `services/scheduler-api/Dockerfile` — multi-stage build (Node.js 20 Alpine), build stage compiles TypeScript, production stage copies only dist and production dependencies
    - Create `services/executor-service/Dockerfile` — same pattern
    - Create `services/webhook-gateway/Dockerfile` — same pattern
    - Create `services/monitor-service/Dockerfile` — same pattern
    - Add `.dockerignore` files excluding node_modules, tests, src
    - Target final image size under 500 MB
    - _Requirements: 14.1_

  - [ ] 13.2 Create Kubernetes namespace, RBAC, and network policies
    - Create `k8s/namespace.yaml` — namespace manifest
    - Create `k8s/rbac.yaml` — ServiceAccount per service scoped to namespace
    - Create `k8s/network-policy.yaml` — allow Scheduler/Executor/Monitor → PostgreSQL/Redis, allow Webhook Gateway → Scheduler API only, deny all other by default
    - Create `k8s/resource-quota.yaml` — limit namespace to 4Gi memory, 4 CPU
    - _Requirements: 14.3_

  - [ ] 13.3 Create Kubernetes deployment manifests for services
    - Create `k8s/scheduler-api/deployment.yaml` — 2 replicas, resources (128Mi/100m request, 512Mi/500m limit), readiness probe (GET /health, initialDelay=10s, period=5s), liveness probe (GET /health, initialDelay=15s, period=10s), port 5000
    - Create `k8s/executor-service/deployment.yaml` — same pattern, port 5001
    - Create `k8s/webhook-gateway/deployment.yaml` — same pattern, port 5002
    - Create `k8s/monitor-service/deployment.yaml` — same pattern, port 5003
    - Create corresponding Service manifests (ClusterIP for internal, LoadBalancer for Webhook Gateway)
    - _Requirements: 14.2_

  - [ ] 13.4 Create PodDisruptionBudget and StatefulSet manifests
    - Create `k8s/*/pdb.yaml` for each service with minAvailable: 1
    - Create `k8s/postgresql/statefulset.yaml` — StatefulSet with PVC requesting 10Gi ReadWriteOnce
    - Create `k8s/redis/statefulset.yaml` — StatefulSet with PVC requesting 10Gi ReadWriteOnce
    - _Requirements: 14.4, 14.5_

  - [ ] 13.5 Create GitHub Actions CI/CD pipeline
    - Create `.github/workflows/ci.yaml`
    - Job `typecheck-build`: run `tsc --noEmit` for all 4 services
    - Job `unit-tests`: run `jest --coverage`, fail if line coverage < 80%
    - Job `trivy-scan`: build Docker images, scan with Trivy for HIGH/CRITICAL vulnerabilities
    - Job `kubeconform`: validate all k8s manifests against Kubernetes 1.29 schemas
    - Configure jobs to run on push to any branch
    - Report failing job name in pipeline summary
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5_

- [ ] 14. Final checkpoint - Full build and test verification
  - Ensure all services build without TypeScript errors, all unit tests pass with ≥80% coverage, all property tests pass, and Kubernetes manifests are valid. Ask the user if questions arise.

## Task Dependency Graph

```
1.1 ─┬─► 1.2 ─┬─► 2.1 ─► 2.2*
     │        │         ├─► 2.3 ─► 2.4*
     │        │         └─► 2.5*
     ├─► 1.3 ─┤
     │        ├─► 2.6 ─► 2.7*
     └─► 1.4 ─┤
               ├─► 2.8 ─► 2.9*
               ├─► 2.10 ─► 2.11*
               ├─► 2.12 ─► 2.13*
               └─► 2.14 ─► 2.15*

2.1, 2.3, 2.6, 2.8, 2.10, 2.12, 2.14 ─► 3 (checkpoint)

3 ─┬─► 4.1 ─► 4.2 ─┬─► 4.3 ─┐
   │                 ├─► 4.4 ─┤
   │                 ├─► 4.5 ─┤
   │                 ├─► 4.6 ─┤
   │                 ├─► 4.7 ─┤
   │                 └─► 4.8 ─┤
   │                           │
   └─► 5.1 ─┬─► 5.2 ─┐       │
             ├─► 5.3 ─┼─► 5.4*│
             ├─► 5.5 ─┤       │
             ├─► 5.6 ─┤       │
             └─► 5.7 ─┘       │
                    │          │
                    ▼          ▼
                    6 (checkpoint)

6 ─┬─► 7.1 ─┬─► 7.2 ─► 7.3
   │         ├─► 7.4 ─► 7.5
   │         ├─► 7.6
   │         ├─► 7.7
   │         └─► 7.8*
   │
   ├─► 8.1 ─► 8.2 ─► 8.3
   │         ├─► 8.4
   │         ├─► 8.5 ─► 8.6
   │         └─► 8.7*
   │
   ├─► 9.1 ─► 9.2 ─► 9.3
   │                  └─► 9.4*
   │
   └─► 10.1 ─► 10.2 ─► 10.3
             ├─► 10.4 ─► 10.5
             └─► 10.6*

7, 8, 9, 10 ─► 11 (checkpoint)

11 ─┬─► 12.1* ─┐
    ├─► 12.2* ─┤
    ├─► 12.3* ─┤
    ├─► 12.4* ─┤
    ├─► 12.5* ─┤
    └─► 12.6* ─┘
               │
               ▼
    ┌─► 13.1 ─┐
    ├─► 13.2 ─┤
    ├─► 13.3 ─┤
    ├─► 13.4 ─┤
    └─► 13.5 ─┘
               │
               ▼
              14 (final checkpoint)
```

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation at logical boundaries
- Property tests validate universal correctness properties defined in the design document (9 properties total)
- Unit tests validate specific examples, edge cases, and error conditions
- Integration tests use testcontainers-node for real PostgreSQL/Redis containers
- All services use the shared types package for consistent interfaces
- The implementation order ensures no orphaned code: foundations → algorithms → data layer → services → tests → infrastructure
