# Requirements Document

## Introduction

The Task Orchestrator Engine is a distributed task scheduling and workflow orchestration platform. It enables users to define workflows as directed acyclic graphs (DAGs) of tasks, schedule them via cron expressions or interval timers, trigger them via webhooks, and monitor their execution with real-time metrics and SLA tracking. The platform is composed of four microservices: Scheduler API, Executor Service, Webhook Gateway, and Monitor Service.

## Glossary

- **Scheduler_API**: The core API service (port 5000) responsible for managing workflows, task definitions, schedules, triggers, and execution history.
- **Executor_Service**: The distributed task execution service (port 5001) responsible for claiming tasks from the queue, executing them in isolation, and reporting results.
- **Webhook_Gateway**: The ingestion service (port 5002) that receives external webhook triggers and maps them to workflow executions.
- **Monitor_Service**: The real-time monitoring service (port 5003) that tracks execution metrics, enforces SLA policies, and provides dashboard data.
- **Workflow**: A user-defined directed acyclic graph (DAG) of task definitions connected by edges, representing a unit of orchestrated work.
- **TaskDefinition**: A node in a workflow DAG that specifies the type of work to execute, its configuration, timeout, and retry policy.
- **Edge**: A directed connection between two task definitions in a workflow, optionally with a condition expression.
- **Execution**: A runtime instance of a workflow, tracking overall status and the state of each task within the workflow.
- **TaskState**: The runtime state of a single task within an execution, including status, attempts, timestamps, and output.
- **Schedule**: A recurring trigger configuration that launches workflow executions based on cron expressions or fixed intervals.
- **TriggerConfig**: Configuration that defines how a workflow can be triggered (manual, schedule, webhook, or event).
- **WebhookRegistration**: A registration record mapping an external webhook endpoint to a specific workflow for trigger purposes.
- **ExecutorHeartbeat**: A periodic signal sent by an executor instance to indicate liveness and report its current load.
- **SLAConfig**: A policy defining maximum acceptable duration for workflow or task execution, with alerting thresholds.
- **ExecutionMetrics**: Aggregated performance data for executions including duration, success rate, and throughput.
- **DAG**: Directed Acyclic Graph — a graph structure with directed edges and no cycles, used to model task dependencies.
- **RetryPolicy**: Configuration specifying how failed tasks should be retried, including strategy (fixed, exponential, linear), max attempts, and delay parameters.
- **Dead_Letter_Queue**: A storage mechanism for tasks that have exhausted all retry attempts and cannot be processed further.
- **Distributed_Lock**: A Redis-based mutual exclusion mechanism ensuring only one executor claims a given task at a time.
- **Task_Queue**: A Redis FIFO queue holding tasks ready for execution by executor instances.

## Requirements

### Requirement 1: Workflow CRUD Operations

**User Story:** As a platform user, I want to create, read, update, and delete workflows, so that I can define and manage my orchestration pipelines.

#### Acceptance Criteria

1. WHEN a workflow definition containing a name, at least one TaskDefinition, and zero or more Edges is submitted via POST /api/v1/workflows, THE Scheduler_API SHALL persist the workflow and return the created workflow with a unique identifier, created timestamp, and HTTP status 201.
2. WHEN a GET request is made to /api/v1/workflows with optional page and pageSize query parameters, THE Scheduler_API SHALL return a paginated list of all workflows using a default page size of 20 and a maximum page size of 100, with HTTP status 200.
3. WHEN a GET request is made to /api/v1/workflows/:id with a valid workflow identifier, THE Scheduler_API SHALL return the complete workflow definition including all task definitions and edges with HTTP status 200.
4. WHEN a PUT request is made to /api/v1/workflows/:id with a workflow definition containing a name, at least one TaskDefinition, and zero or more Edges, THE Scheduler_API SHALL persist the changes and return the updated workflow with HTTP status 200.
5. WHEN a DELETE request is made to /api/v1/workflows/:id for a workflow with no active executions in pending or running status, THE Scheduler_API SHALL remove the workflow and return HTTP status 204.
6. IF a request references a workflow identifier that does not exist, THEN THE Scheduler_API SHALL return HTTP status 404 with an error response indicating the workflow identifier was not found.
7. IF a DELETE request is made for a workflow that has executions in pending or running status, THEN THE Scheduler_API SHALL reject the request with HTTP status 409 and an error response indicating the workflow has active executions.

### Requirement 2: DAG Validation

**User Story:** As a platform user, I want my workflow definitions validated as proper DAGs, so that I can be confident there are no cycles or invalid structures before execution.

#### Acceptance Criteria

1. WHEN a workflow is created or updated, THE Scheduler_API SHALL validate that the task definitions and edges form a valid directed acyclic graph using topological sort with DFS-based cycle detection before persisting the workflow.
2. IF a cycle is detected in the workflow graph, THEN THE Scheduler_API SHALL reject the workflow with HTTP status 400 and a descriptive error identifying the nodes involved in the cycle.
3. WHEN a workflow contains edges referencing task definition identifiers that do not exist in the workflow, THE Scheduler_API SHALL reject the workflow with HTTP status 400 and identify the invalid edge references.
4. THE Scheduler_API SHALL require a workflow to contain at least one TaskDefinition; a workflow submitted with zero TaskDefinitions SHALL be rejected with HTTP status 400.
5. THE Scheduler_API SHALL validate that all task definitions are reachable from root tasks (tasks with no incoming edges); disconnected subgraphs SHALL be rejected with HTTP status 400.
6. FOR ALL valid workflow definitions, parsing then serializing then parsing the DAG SHALL produce a graph with identical sets of task definition identifiers and identical sets of directed edges (round-trip property).

### Requirement 3: Workflow Execution Lifecycle

**User Story:** As a platform user, I want to execute workflows and track their progress, so that I can run orchestrated task pipelines and monitor their outcomes.

#### Acceptance Criteria

1. WHEN a POST request is made to /api/v1/workflows/:id/execute with optional input parameters, THE Scheduler_API SHALL create a new execution record in pending status, initialize a TaskState record in pending status for each task definition in the workflow, enqueue root tasks (tasks with no incoming edges) to the Task_Queue, transition the execution to running status, and return the execution identifier with HTTP status 202.
2. WHILE an execution is in running status, THE Scheduler_API SHALL maintain individual TaskState records for each task definition in the workflow, updating each record's status, attempt count, start timestamp, end timestamp, and output as reported by the Executor_Service.
3. WHEN all tasks in an execution reach completed status, THE Scheduler_API SHALL transition the execution to completed status and record the completion timestamp.
4. IF any task in an execution reaches failed status after exhausting retries and no outgoing edges from that task lead to uncompleted downstream tasks that could still be reached via other paths, THEN THE Scheduler_API SHALL transition the execution to failed status and record the failure timestamp.
5. WHEN a GET request is made to /api/v1/executions/:id with a valid execution identifier, THE Scheduler_API SHALL return the execution status including all TaskState records with HTTP status 200.
6. WHEN a POST request is made to /api/v1/executions/:id/cancel for an execution in pending or running status, THE Scheduler_API SHALL transition the execution to cancelled status, transition all pending TaskState records to cancelled status, and enqueue cancellation messages for any tasks currently in running status.
7. IF a POST request to /api/v1/workflows/:id/execute references a workflow identifier that does not exist, THEN THE Scheduler_API SHALL return HTTP status 404 with an error message indicating the workflow was not found.
8. IF a GET or cancel request references an execution identifier that does not exist, THEN THE Scheduler_API SHALL return HTTP status 404 with an error message indicating the execution was not found.
9. IF a POST request to /api/v1/executions/:id/cancel targets an execution already in a terminal status (completed, failed, or cancelled), THEN THE Scheduler_API SHALL return HTTP status 409 with an error message indicating the execution cannot be cancelled in its current state.

### Requirement 4: Execution State Machine

**User Story:** As a platform operator, I want task execution to follow a well-defined state machine, so that state transitions are predictable and auditable.

#### Acceptance Criteria

1. WHEN a task is created, THE Executor_Service SHALL assign it the initial state "pending".
2. THE Executor_Service SHALL enforce the following valid task state transitions: pending to running, running to completed, running to failed, running to cancelled, running to timed_out, pending to cancelled.
3. IF an invalid state transition is attempted, THEN THE Executor_Service SHALL reject the transition, preserve the task's current state unchanged, and return an error indicating the current state, the attempted state, and the task identifier.
4. IF a transition to a terminal state (completed, failed, cancelled, or timed_out) is attempted on a task already in a terminal state, THEN THE Executor_Service SHALL make no state change and return a response indicating the task is already in a terminal state.
5. WHEN a task state transition occurs, THE Executor_Service SHALL record an audit entry containing the task identifier, the previous state, the new state, and a timestamp.

### Requirement 5: Distributed Task Claiming

**User Story:** As a platform operator, I want tasks to be claimed atomically by exactly one executor, so that no task is executed more than once concurrently.

#### Acceptance Criteria

1. WHEN a task transitions to a scheduled state, THE Scheduler_API SHALL enqueue the task identifier to the Redis Task_Queue using LPUSH.
2. WHEN an executor instance has no task currently assigned, THE Executor_Service SHALL claim a task from the Task_Queue using BRPOPLPUSH with a blocking timeout of 5 seconds to atomically move the task to a processing list.
3. WHEN an executor claims a task, THE Executor_Service SHALL acquire a Distributed_Lock for that task using Redis SETNX with a TTL of 30 seconds.
4. IF a Distributed_Lock already exists for a task, THEN THE Executor_Service SHALL skip that task and re-enqueue it to the tail of the Task_Queue.
5. WHILE a task is being executed, THE Executor_Service SHALL renew the Distributed_Lock every 10 seconds to prevent expiration during long-running tasks.
6. IF the Distributed_Lock renewal fails or the lock has been acquired by another instance, THEN THE Executor_Service SHALL abort execution of that task and not persist any partial results.
7. THE Executor_Service SHALL guarantee that for all concurrent claim attempts on the same task by multiple executor instances, exactly one executor successfully acquires the lock and executes the task.
8. IF an executor instance fails to complete a task within 300 seconds or becomes unresponsive, THEN THE Scheduler_API SHALL detect the orphaned entry in the processing list and re-enqueue the task to the Task_Queue within 60 seconds of lock expiration.

### Requirement 6: Task Execution and Fan-Out/Fan-In

**User Story:** As a platform user, I want my workflow to execute tasks in parallel where dependencies allow, so that execution completes as quickly as possible.

#### Acceptance Criteria

1. WHEN a task completes successfully, THE Executor_Service SHALL evaluate all outgoing edges from that task and enqueue downstream tasks whose incoming dependencies are all satisfied within 1 second of the triggering task's completion.
2. WHEN a successfully completed task has multiple outgoing edges with no conditions, THE Executor_Service SHALL enqueue all downstream tasks to the Task_Queue in a single atomic operation (fan-out).
3. WHEN a task has multiple incoming edges, THE Executor_Service SHALL enqueue that task only after all upstream tasks have reached a terminal state (completed or skipped) with at least one upstream path completing successfully (fan-in).
4. WHEN an edge has a condition expression, THE Executor_Service SHALL evaluate the condition against the upstream task output and enqueue the downstream task only if the condition evaluates to true.
5. IF an edge condition evaluates to false, THEN THE Executor_Service SHALL mark the downstream task as skipped and propagate the skipped status through any further downstream tasks that have no other satisfiable incoming path.
6. IF a condition expression evaluation fails due to a malformed expression or missing output field, THEN THE Executor_Service SHALL treat the edge condition as false, mark the downstream task as skipped, and log the evaluation error with the edge identifier and expression.
7. IF all incoming edges to a task have conditions that evaluate to false, THEN THE Executor_Service SHALL mark that task as skipped rather than waiting indefinitely for a trigger that cannot arrive.

### Requirement 7: Retry Policies

**User Story:** As a platform user, I want to configure retry policies for tasks, so that transient failures are handled automatically without manual intervention.

#### Acceptance Criteria

1. WHEN a task fails and a RetryPolicy is configured with strategy "fixed", THE Executor_Service SHALL retry the task after the configured baseDelay in milliseconds (valid range: 100 to 300000), up to the configured maxAttempts value.
2. WHEN a task fails and a RetryPolicy is configured with strategy "exponential", THE Executor_Service SHALL retry the task with a delay of baseDelay * 2^(attemptNumber - 1) milliseconds capped at a maximum delay of 300000 milliseconds, up to the configured maxAttempts value.
3. WHEN a task fails and a RetryPolicy is configured with strategy "linear", THE Executor_Service SHALL retry the task with a delay of baseDelay * attemptNumber milliseconds capped at a maximum delay of 300000 milliseconds, up to the configured maxAttempts value.
4. IF a task has exhausted all retry attempts, THEN THE Executor_Service SHALL move the task to the Dead_Letter_Queue and transition the task to failed status.
5. FOR ALL retry policies, maxAttempts SHALL be an integer in the range 1 to 10 representing the total number of execution attempts (1 initial attempt plus maxAttempts - 1 retries), and baseDelay SHALL be an integer in the range 100 to 300000 milliseconds.
6. WHEN a task succeeds on a retry attempt, THE Executor_Service SHALL transition the task to completed status, cease further retry attempts, and record the total number of attempts taken.
7. IF a task fails and no RetryPolicy is configured, THEN THE Executor_Service SHALL transition the task to failed status immediately without retrying.
8. WHILE a retry delay is pending for a task, THE Executor_Service SHALL maintain the task in a pending state and SHALL NOT release the Distributed_Lock for that task until the retry attempt begins or all attempts are exhausted.

### Requirement 8: Executor Heartbeat and Health

**User Story:** As a platform operator, I want executor instances to report their health via heartbeats, so that stalled executors can be detected and their tasks reassigned.

#### Acceptance Criteria

1. WHEN an executor instance starts, THE Executor_Service SHALL send an initial ExecutorHeartbeat to Redis within 5 seconds of startup and subsequently every 30 seconds, containing the executor identifier, timestamp, current task count, and maximum capacity.
2. WHEN an executor acquires a Distributed_Lock for a task, THE Executor_Service SHALL store the executor identifier in the lock metadata to enable ownership tracking.
3. IF an executor instance fails to send a heartbeat within 90 seconds, THEN THE Monitor_Service SHALL mark that executor as unhealthy and trigger reassignment of its in-progress tasks.
4. WHEN an executor is marked unhealthy, THE Scheduler_API SHALL release all Distributed_Locks held by that executor, transition affected tasks to pending status preserving their retry attempt count, and re-enqueue the affected tasks to the Task_Queue.
5. IF re-enqueue of an affected task fails during unhealthy executor cleanup, THEN THE Scheduler_API SHALL retry the re-enqueue operation up to 3 times with a 1-second delay between attempts and log a critical error if all retries fail.

### Requirement 9: Schedule Management

**User Story:** As a platform user, I want to schedule workflows to run on cron expressions or fixed intervals, so that recurring work executes automatically.

#### Acceptance Criteria

1. WHEN a POST request is made to /api/v1/schedules with a valid cron expression (5-field format) and an existing workflow identifier, THE Scheduler_API SHALL create a schedule record and return it with HTTP status 201.
2. WHILE a schedule is active, WHEN the current time matches the cron expression evaluated in the schedule's configured timezone (defaulting to UTC if not specified), THE Scheduler_API SHALL create a new execution of the associated workflow.
3. WHILE a schedule is active, WHEN the elapsed time since the last execution equals or exceeds the configured interval (minimum 1000 milliseconds, maximum 86,400,000 milliseconds), THE Scheduler_API SHALL create a new execution of the associated workflow.
4. IF the Scheduler_API was unavailable during one or more scheduled run times, THEN THE Scheduler_API SHALL detect the missed runs on recovery and execute only the single most recent missed run within 60 seconds of becoming available.
5. WHEN a GET request is made to /api/v1/schedules, THE Scheduler_API SHALL return schedule records paginated with a default page size of 50 and a maximum page size of 100, each record including its next calculated run time.
6. THE Scheduler_API SHALL, for all valid 5-field cron expressions and a reference timestamp, compute the next run time as a timestamp strictly greater than the reference timestamp.
7. IF a POST request is made to /api/v1/schedules with an invalid cron expression, an interval outside the range of 1000 to 86,400,000 milliseconds, or a non-existent workflow identifier, THEN THE Scheduler_API SHALL reject the request with HTTP status 422 and return an error message indicating which field failed validation.
8. IF a schedule's associated workflow no longer exists at the time of a scheduled run, THEN THE Scheduler_API SHALL skip the execution and mark the schedule as failed with an error message indicating the workflow was not found.
9. WHEN a PATCH request is made to /api/v1/schedules/{id} with an active field set to false, THE Scheduler_API SHALL deactivate the schedule and cease creating new executions until reactivated.

### Requirement 10: Trigger Configuration

**User Story:** As a platform user, I want to configure multiple trigger types for workflows, so that I can start executions via manual invocation, schedules, webhooks, or events.

#### Acceptance Criteria

1. WHEN a workflow is created with a TriggerConfig of type "manual", THE Scheduler_API SHALL allow execution only via explicit POST to the execute endpoint.
2. WHEN a workflow is created with a TriggerConfig of type "schedule" referencing a valid schedule identifier, THE Scheduler_API SHALL associate the workflow with the specified schedule record.
3. WHEN a workflow is created with a TriggerConfig of type "webhook", THE Scheduler_API SHALL generate a unique webhook URL and create a WebhookRegistration record, returning the generated URL in the response.
4. WHEN a workflow is created with a TriggerConfig of type "event", THE Scheduler_API SHALL subscribe to the specified event pattern and trigger execution when a matching event is received.
5. IF a workflow is created with a TriggerConfig of type "schedule" referencing a non-existent schedule identifier, THEN THE Scheduler_API SHALL reject the workflow with HTTP status 422 and an error message indicating the schedule was not found.
6. IF a workflow is created with a TriggerConfig containing an invalid type value, THEN THE Scheduler_API SHALL reject the workflow with HTTP status 400 and an error message indicating the valid trigger types.

### Requirement 11: Webhook Ingestion

**User Story:** As an external system operator, I want to trigger workflow executions via HTTP webhooks, so that external events can initiate orchestrated pipelines.

#### Acceptance Criteria

1. WHEN an HTTP POST request is received at /api/v1/webhooks/:id with a valid webhook identifier, THE Webhook_Gateway SHALL validate that the request payload is well-formed JSON not exceeding 1 MB in size and forward it to the Scheduler_API to create a new workflow execution.
2. WHEN a webhook request is received for a WebhookRegistration that has a registered secret, THE Webhook_Gateway SHALL verify the HMAC-SHA256 signature provided in the request signature header against the registered secret before processing.
3. IF a webhook request is received for a WebhookRegistration that has a registered secret and the signature header is missing or the signature is invalid, THEN THE Webhook_Gateway SHALL reject the request with HTTP status 401.
4. IF a webhook identifier does not match any WebhookRegistration, THEN THE Webhook_Gateway SHALL return HTTP status 404.
5. WHEN a webhook is successfully processed, THE Webhook_Gateway SHALL return HTTP status 202 with the created execution identifier.
6. THE Webhook_Gateway SHALL process webhook requests within 500 milliseconds at the 95th percentile under normal operating conditions.
7. IF the request payload is not valid JSON or exceeds 1 MB, THEN THE Webhook_Gateway SHALL reject the request with HTTP status 400 and an error message indicating the validation failure reason.
8. IF the Scheduler_API is unavailable or returns an error when the Webhook_Gateway attempts to forward a validated webhook request, THEN THE Webhook_Gateway SHALL return HTTP status 502 and an error message indicating that workflow creation failed.

### Requirement 12: Real-Time Monitoring and Metrics

**User Story:** As a platform operator, I want real-time visibility into execution metrics and system health, so that I can identify issues and optimize performance.

#### Acceptance Criteria

1. WHEN a GET request is made to /api/v1/monitor/metrics, THE Monitor_Service SHALL return current ExecutionMetrics including active execution count, success rate as a percentage over the last 60 minutes, average duration in milliseconds over the last 60 minutes, and throughput as completed executions per minute over the last 60 minutes.
2. WHEN a GET request is made to /api/v1/monitor/executors, THE Monitor_Service SHALL return the health status, current task count, and maximum capacity of all registered executor instances based on their latest ExecutorHeartbeat.
3. THE Monitor_Service SHALL cache computed metrics in Redis with a TTL of 10 seconds to reduce database load.
4. WHEN a GET request is made to /api/v1/monitor/dashboard, THE Monitor_Service SHALL return an aggregated view combining execution metrics, executor health, and up to 50 of the most recent alerts from the last 24 hours sorted by timestamp descending.
5. IF a monitoring endpoint is requested and no execution data or executor registrations exist, THEN THE Monitor_Service SHALL return HTTP status 200 with zero-value metrics and an empty executor list rather than an error.
6. THE Monitor_Service SHALL respond to all monitoring endpoint requests within 2000 milliseconds.

### Requirement 13: SLA Tracking and Alerting

**User Story:** As a platform operator, I want to define SLA policies and receive alerts when executions breach them, so that I can respond to performance degradation promptly.

#### Acceptance Criteria

1. WHEN an SLAConfig is defined for a workflow with a maximum duration in milliseconds, THE Monitor_Service SHALL check the elapsed time of each running execution of that workflow every 5 seconds.
2. IF an execution exceeds the configurable warning threshold percentage (default 80%) of the SLA maximum duration, THEN THE Monitor_Service SHALL emit a warning alert containing the execution identifier, workflow identifier, elapsed time, SLA limit, and severity level.
3. IF an execution exceeds the SLA maximum duration, THEN THE Monitor_Service SHALL emit a critical alert containing the execution identifier, workflow identifier, elapsed time, SLA limit, and severity level, and mark the execution as breaching SLA.
4. WHEN a GET request is made to /api/v1/monitor/alerts, THE Monitor_Service SHALL return all active and recent alerts from the last 24 hours, up to a maximum of 200 results, sorted by severity and timestamp descending.
5. WHEN a POST request is made to /api/v1/monitor/sla-configs with a valid workflow identifier and maximum duration (minimum 1000 milliseconds), THE Monitor_Service SHALL create the SLA configuration and return it with HTTP status 201.
6. WHEN an execution that previously breached its SLA completes or is cancelled, THE Monitor_Service SHALL resolve the associated alert by marking it as resolved with the resolution timestamp.

### Requirement 14: Infrastructure and Deployment

**User Story:** As a DevOps engineer, I want Kubernetes manifests and Docker configurations for all services, so that the platform can be deployed to a Kubernetes cluster reliably.

#### Acceptance Criteria

1. THE platform SHALL provide a Dockerfile for each service (Scheduler_API, Executor_Service, Webhook_Gateway, Monitor_Service) that uses a multi-stage build with Node.js 20 Alpine, where the build stage installs dependencies and compiles TypeScript, and the production stage copies only compiled output and production dependencies, producing a final image no larger than 500 MB.
2. THE platform SHALL provide Kubernetes deployment manifests for all four services, each configured with a minimum of 2 replicas, resource requests of 128 Mi memory and 100m CPU, resource limits of 512 Mi memory and 500m CPU, a readiness probe targeting the service health endpoint on its designated port (5000, 5001, 5002, 5003 respectively) with initialDelaySeconds of 10 and periodSeconds of 5, and a liveness probe targeting the same endpoint with initialDelaySeconds of 15 and periodSeconds of 10.
3. THE platform SHALL provide a Kubernetes namespace manifest, RBAC configuration with a ServiceAccount per service scoped to the namespace, a NetworkPolicy that allows Scheduler_API, Executor_Service, and Monitor_Service to communicate with PostgreSQL and Redis pods, allows Webhook_Gateway to communicate only with Scheduler_API, and denies all other inter-pod traffic by default, and a ResourceQuota limiting the namespace to 4 Gi total memory and 4 CPU cores.
4. THE platform SHALL provide PodDisruptionBudget manifests for each service specifying minAvailable of 1, ensuring at least one replica remains available during voluntary disruptions.
5. THE platform SHALL provide Kubernetes StatefulSet manifests for PostgreSQL and Redis, each with a PersistentVolumeClaim requesting 10 Gi of storage with ReadWriteOnce access mode.

### Requirement 15: CI/CD Pipeline

**User Story:** As a developer, I want automated CI checks on every push, so that code quality, security, and Kubernetes manifest validity are continuously verified.

#### Acceptance Criteria

1. WHEN code is pushed to any branch, THE CI pipeline SHALL execute a typecheck-build job that runs TypeScript compilation and verifies all four services (Scheduler_API, Executor_Service, Webhook_Gateway, Monitor_Service) build without errors.
2. WHEN code is pushed to any branch, THE CI pipeline SHALL execute a unit-tests job that runs all Jest test suites and fails the job if line coverage falls below 80%.
3. WHEN code is pushed to any branch, THE CI pipeline SHALL execute a trivy-scan job that scans container images for vulnerabilities with severity HIGH or CRITICAL and fails the job if one or more such vulnerabilities are found.
4. WHEN code is pushed to any branch, THE CI pipeline SHALL execute a kubeconform job that validates all Kubernetes manifests against the Kubernetes API schemas for version 1.29 and fails the job if any manifest is invalid.
5. IF any CI pipeline job fails, THEN THE CI pipeline SHALL mark the overall pipeline status as failed and report the failing job name in the pipeline summary.

### Requirement 16: Property-Based Testing

**User Story:** As a developer, I want property-based tests for core algorithmic logic, so that edge cases and invariants are thoroughly validated across randomized inputs.

#### Acceptance Criteria

1. THE test suite SHALL include property-based tests using fast-check (minimum 100 generated cases per property) that verify DAG validation correctly rejects all randomly generated graphs containing cycles and accepts all randomly generated graphs without cycles, for graphs with 1 to 50 nodes and 0 to 200 edges.
2. THE test suite SHALL include property-based tests (minimum 100 generated cases) that verify topological sort produces a valid ordering for all valid DAGs with 1 to 50 nodes (every edge goes from earlier to later in the ordering) and that the output contains exactly the same set of nodes as the input.
3. THE test suite SHALL include property-based tests (minimum 100 generated cases) that verify retry delay calculations produce an exact integer millisecond match to the mathematical formula for each strategy (fixed, exponential, linear) across randomized inputs with maxAttempts from 1 to 10 and baseDelay from 100 to 60000 milliseconds.
4. THE test suite SHALL include property-based tests (minimum 100 generated cases) that verify the task state machine rejects all invalid transitions and accepts all valid transitions as defined in Requirement 4 (valid states: pending, running, completed, failed, cancelled, timed_out).
5. THE test suite SHALL include property-based tests (minimum 100 generated cases) that verify distributed task claiming guarantees exactly-once semantics when 2 to 10 concurrent simulated claim attempts target the same task simultaneously.
6. THE test suite SHALL include property-based tests (minimum 100 generated cases) that verify cron next-run calculation always produces a timestamp strictly greater than the reference timestamp for all randomly generated valid 5-field cron expressions.

### Requirement 17: Integration Testing

**User Story:** As a developer, I want integration tests that verify end-to-end behavior using real PostgreSQL and Redis instances, so that I can be confident the services work correctly together.

#### Acceptance Criteria

1. THE test suite SHALL include integration tests using testcontainers-node that spin up real PostgreSQL and Redis containers and verify a workflow execution containing at least 3 task definitions with dependencies, from workflow creation via API through all tasks reaching completed status, asserting final execution status and individual TaskState records in the database.
2. THE test suite SHALL include integration tests that verify parallel fan-out and fan-in execution with a workflow containing at least 3 concurrent tasks in the fan-out stage and a single fan-in task, asserting that all fan-out tasks execute concurrently and the fan-in task executes only after all upstream tasks complete.
3. THE test suite SHALL include integration tests that verify retry behavior for all three RetryPolicy strategies (fixed, exponential, linear) with actual delays, asserting that the number of attempts matches the configured maxAttempts and that inter-attempt delays conform to the strategy formula, with a maximum test execution timeout of 30 seconds per retry scenario.
4. THE test suite SHALL include integration tests that verify webhook-triggered workflow execution from HTTP POST receipt at the Webhook_Gateway through workflow completion, asserting that the webhook returns HTTP status 202, the execution is created, and all tasks reach a terminal state.
5. THE test suite SHALL include integration tests that verify schedule-triggered workflow execution with simulated time advancement, asserting that the workflow execution is created when the simulated time matches the cron expression.
6. THE test suite SHALL include integration tests that verify failure propagation by executing a workflow where a task fails after exhausting all retry attempts, asserting that the task is moved to the Dead_Letter_Queue and the execution transitions to failed status.
