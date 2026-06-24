-- 002: executions, task_states, task_state_audit
CREATE TABLE executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id UUID NOT NULL REFERENCES workflows(id),
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
    input JSONB,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_executions_workflow ON executions(workflow_id);
CREATE INDEX idx_executions_status ON executions(status);

CREATE TABLE task_states (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    execution_id UUID NOT NULL REFERENCES executions(id) ON DELETE CASCADE,
    task_definition_id UUID NOT NULL REFERENCES task_definitions(id),
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled', 'timed_out', 'skipped')),
    attempt_count INTEGER NOT NULL DEFAULT 0,
    output JSONB,
    error TEXT,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_task_states_execution ON task_states(execution_id);
CREATE INDEX idx_task_states_status ON task_states(status);

CREATE TABLE task_state_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_state_id UUID NOT NULL REFERENCES task_states(id) ON DELETE CASCADE,
    previous_state VARCHAR(20) NOT NULL,
    new_state VARCHAR(20) NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_audit_task_state ON task_state_audit(task_state_id);
