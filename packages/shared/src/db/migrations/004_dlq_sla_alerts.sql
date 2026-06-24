-- 004: dead_letter_queue, sla_configs, alerts
CREATE TABLE dead_letter_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_state_id UUID NOT NULL REFERENCES task_states(id),
    execution_id UUID NOT NULL REFERENCES executions(id),
    error TEXT,
    attempts INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE sla_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
    max_duration_ms INTEGER NOT NULL CHECK (max_duration_ms >= 1000),
    warning_threshold_pct INTEGER NOT NULL DEFAULT 80 CHECK (warning_threshold_pct > 0 AND warning_threshold_pct < 100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_sla_configs_workflow ON sla_configs(workflow_id);

CREATE TABLE alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    execution_id UUID NOT NULL REFERENCES executions(id),
    workflow_id UUID NOT NULL REFERENCES workflows(id),
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('warning', 'critical')),
    message TEXT NOT NULL,
    elapsed_ms INTEGER NOT NULL,
    sla_limit_ms INTEGER NOT NULL,
    resolved BOOLEAN NOT NULL DEFAULT FALSE,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_alerts_execution ON alerts(execution_id);
CREATE INDEX idx_alerts_created ON alerts(created_at);
CREATE INDEX idx_alerts_severity ON alerts(severity);
