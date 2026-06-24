-- 001: workflows, task_definitions, edges
CREATE TABLE workflows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    trigger_config JSONB NOT NULL DEFAULT '{"type": "manual"}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE task_definitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL,
    config JSONB NOT NULL DEFAULT '{}',
    timeout_ms INTEGER NOT NULL DEFAULT 300000,
    retry_policy JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_task_definitions_workflow ON task_definitions(workflow_id);

CREATE TABLE edges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
    source_task_id UUID NOT NULL REFERENCES task_definitions(id) ON DELETE CASCADE,
    target_task_id UUID NOT NULL REFERENCES task_definitions(id) ON DELETE CASCADE,
    condition_expr TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(workflow_id, source_task_id, target_task_id)
);
CREATE INDEX idx_edges_workflow ON edges(workflow_id);
CREATE INDEX idx_edges_source ON edges(source_task_id);
CREATE INDEX idx_edges_target ON edges(target_task_id);
