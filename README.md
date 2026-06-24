# Task Orchestrator Engine

[![CI](https://github.com/Djones-qa/task-orchestrator-engine/actions/workflows/ci.yaml/badge.svg)](https://github.com/Djones-qa/task-orchestrator-engine/actions/workflows/ci.yaml)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/typescript-5.3-blue)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

A distributed task scheduling and workflow orchestration platform built with TypeScript, Express.js, PostgreSQL, and Redis. Supports DAG-based workflow execution, cron/interval scheduling, webhook triggers, fan-out/fan-in parallelism, retry policies, and SLA monitoring.

## Architecture

```
┌─────────────────┐     ┌───────────────────┐     ┌──────────────────┐
│  Scheduler API  │────▶│  Redis (Queue +   │◀────│ Executor Service │
│   (port 5000)   │     │   Pub/Sub + Lock)  │     │   (port 5001)    │
└─────────────────┘     └───────────────────┘     └──────────────────┘
        │                                                   │
        ▼                                                   ▼
┌─────────────────┐     ┌───────────────────┐     ┌──────────────────┐
│   PostgreSQL    │◀────│  Monitor Service  │     │ Webhook Gateway  │
│   (workflows,   │     │   (port 5003)     │     │   (port 5002)    │
│   executions)   │     └───────────────────┘     └──────────────────┘
└─────────────────┘
```

## Services

| Service | Port | Description |
|---------|------|-------------|
| **Scheduler API** | 5000 | Workflow CRUD, execution triggers, schedule management |
| **Executor Service** | 5001 | Claims tasks from Redis queue, executes with timeout/retry |
| **Webhook Gateway** | 5002 | Receives external webhooks, validates HMAC, triggers workflows |
| **Monitor Service** | 5003 | Metrics aggregation, SLA checking, executor health tracking |

## API Endpoints

### Scheduler API (`:5000`)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/workflows` | Create a workflow |
| `GET` | `/api/v1/workflows` | List workflows (paginated) |
| `GET` | `/api/v1/workflows/:id` | Get workflow by ID |
| `PUT` | `/api/v1/workflows/:id` | Update workflow |
| `DELETE` | `/api/v1/workflows/:id` | Delete workflow |
| `POST` | `/api/v1/workflows/:id/execute` | Trigger workflow execution |
| `GET` | `/api/v1/executions/:id` | Get execution status and task states |
| `POST` | `/api/v1/executions/:id/cancel` | Cancel a running execution |
| `POST` | `/api/v1/schedules` | Create a schedule |
| `GET` | `/api/v1/schedules` | List schedules |
| `PATCH` | `/api/v1/schedules/:id` | Toggle schedule active/inactive |

### Webhook Gateway (`:5002`)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/webhooks/:workflowId` | Receive webhook trigger |

### Monitor Service (`:5003`)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/metrics` | Execution metrics (active count, success rate, throughput) |
| `GET` | `/api/v1/executors/health` | Executor health status |
| `GET` | `/api/v1/alerts` | Recent alerts |

## Prerequisites

- Node.js >= 20
- PostgreSQL 16+
- Redis 7+
- npm (workspace support)

## Setup

```bash
# Clone the repository
git clone https://github.com/Djones-qa/task-orchestrator-engine.git
cd task-orchestrator-engine

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your database and Redis connection strings

# Run database migrations
npm run migrate

# Build all packages
npm run build

# Start services (development)
npm run dev --workspace=services/scheduler-api
npm run dev --workspace=services/executor-service
npm run dev --workspace=services/webhook-gateway
npm run dev --workspace=services/monitor-service
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://localhost:5432/task_orchestrator` |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379` |
| `PORT` | HTTP server port | Service-specific |
| `EXECUTOR_ID` | Unique executor instance ID | Auto-generated |

## Project Structure

```
task-orchestrator-engine/
├── packages/
│   └── shared/              # Core algorithms, DB pool, Redis utilities, types
├── services/
│   ├── scheduler-api/       # Workflow management & execution scheduling
│   ├── executor-service/    # Task execution with retry & fan-out
│   ├── webhook-gateway/     # External webhook ingestion
│   └── monitor-service/     # Metrics, SLA, and health monitoring
├── k8s/                     # Kubernetes deployment manifests
├── .github/workflows/       # CI pipeline
└── package.json             # Workspace root
```

## Deployment

The project includes production-ready Kubernetes manifests in `k8s/`:

```bash
# Create namespace and RBAC
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/rbac.yaml
kubectl apply -f k8s/network-policy.yaml
kubectl apply -f k8s/resource-quota.yaml

# Deploy infrastructure
kubectl apply -f k8s/postgresql/
kubectl apply -f k8s/redis/

# Deploy services
kubectl apply -f k8s/scheduler-api/
kubectl apply -f k8s/executor-service/
kubectl apply -f k8s/webhook-gateway/
kubectl apply -f k8s/monitor-service/
```

## Key Features

- **DAG Validation** — Cycle detection, reachability checks, edge reference validation
- **Fan-Out/Fan-In** — Parallel task execution with join semantics
- **Distributed Locking** — Redis-based locks prevent double execution
- **Retry Policies** — Fixed, exponential, and linear backoff strategies (1-10 attempts)
- **Cron Scheduling** — Standard cron expressions with timezone support
- **HMAC Webhook Security** — SHA-256 signature validation
- **SLA Monitoring** — Warning/critical alerts based on execution duration
- **Orphan Detection** — Automatically re-enqueues abandoned tasks
- **Heartbeat Tracking** — Executor liveness monitoring with 90s TTL

## Author

**Darrius Jones**

- GitHub: [@Djones-qa](https://github.com/Djones-qa)
- LinkedIn: [darrius-jones-28226b350](https://www.linkedin.com/in/darrius-jones-28226b350)

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

© 2024 Darrius Jones
