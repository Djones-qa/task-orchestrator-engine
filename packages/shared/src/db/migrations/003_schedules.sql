-- 003: schedules, webhook_registrations
CREATE TABLE schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
    cron_expr VARCHAR(100),
    interval_ms INTEGER CHECK (interval_ms IS NULL OR (interval_ms >= 1000 AND interval_ms <= 86400000)),
    timezone VARCHAR(50) DEFAULT 'UTC',
    active BOOLEAN NOT NULL DEFAULT TRUE,
    last_run_at TIMESTAMPTZ,
    next_run_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (cron_expr IS NOT NULL OR interval_ms IS NOT NULL)
);
CREATE INDEX idx_schedules_workflow ON schedules(workflow_id);
CREATE INDEX idx_schedules_next_run ON schedules(next_run_at) WHERE active = TRUE;

CREATE TABLE webhook_registrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
    secret VARCHAR(255),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_webhooks_workflow ON webhook_registrations(workflow_id);
