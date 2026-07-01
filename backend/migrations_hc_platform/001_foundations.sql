-- =============================================================================
-- HC Platform port — Phase 1 foundations migration
-- =============================================================================
-- Idempotent. Covers Domains 1 (tenant extras), 2, 3, 3b, 10.
-- Run order: extensions -> tenant ALTERs -> tables ordered by FK dependency.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =============================================================================
-- Domain 1 — extend existing tenants (do NOT recreate)
-- =============================================================================

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS challenge_brief         JSONB;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS strategic_priorities    JSONB;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS success_measures        JSONB;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS primary_hc_priorities   JSONB;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS region                  VARCHAR(100);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS industry                VARCHAR(100);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS company_size            VARCHAR(50);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS stripe_customer_id      VARCHAR(255);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS stripe_subscription_id  VARCHAR(255);

-- =============================================================================
-- Domain 2 — modules / subscription_plans / entitlements
-- =============================================================================

CREATE TABLE IF NOT EXISTS modules (
    id           SERIAL PRIMARY KEY,
    key          VARCHAR(100)  NOT NULL UNIQUE,
    label        VARCHAR(255)  NOT NULL,
    description  TEXT,
    route_path   VARCHAR(255),
    icon         VARCHAR(100),
    category     VARCHAR(100)  NOT NULL,
    status       VARCHAR(50)   NOT NULL DEFAULT 'prototype',
    metadata     JSONB,
    sort_order   INTEGER       NOT NULL DEFAULT 0,
    plan_tier    VARCHAR(50),
    created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_modules_key      ON modules(key);
CREATE INDEX IF NOT EXISTS ix_modules_category ON modules(category);


CREATE TABLE IF NOT EXISTS subscription_plans (
    id                   SERIAL PRIMARY KEY,
    key                  VARCHAR(100)  NOT NULL UNIQUE,
    name                 VARCHAR(255)  NOT NULL,
    description          TEXT,
    monthly_price_cents  INTEGER,
    stripe_price_id      VARCHAR(255),
    stripe_product_id    VARCHAR(255),
    is_default           BOOLEAN       NOT NULL DEFAULT false,
    is_active            BOOLEAN       NOT NULL DEFAULT true,
    sort_order           INTEGER       NOT NULL DEFAULT 0,
    metadata             JSONB,
    created_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_subscription_plans_key ON subscription_plans(key);


CREATE TABLE IF NOT EXISTS entitlements (
    id          SERIAL PRIMARY KEY,
    plan_id     INTEGER       NOT NULL REFERENCES subscription_plans(id) ON DELETE CASCADE,
    module_key  VARCHAR(100)  NOT NULL,
    max_seats   INTEGER,
    metadata    JSONB,
    created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX        IF NOT EXISTS ix_entitlements_plan_id              ON entitlements(plan_id);
CREATE INDEX        IF NOT EXISTS ix_entitlements_module_key           ON entitlements(module_key);
CREATE UNIQUE INDEX IF NOT EXISTS uq_entitlements_plan_module          ON entitlements(plan_id, module_key);


CREATE TABLE IF NOT EXISTS tenant_modules (
    id          SERIAL PRIMARY KEY,
    tenant_id   UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    module_key  VARCHAR(100)  NOT NULL,
    status      VARCHAR(50)   NOT NULL DEFAULT 'active',
    granted_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    revoked_at  TIMESTAMPTZ,
    metadata    JSONB
);

CREATE INDEX        IF NOT EXISTS ix_tenant_modules_tenant_id     ON tenant_modules(tenant_id);
CREATE INDEX        IF NOT EXISTS ix_tenant_modules_module_key    ON tenant_modules(module_key);
CREATE UNIQUE INDEX IF NOT EXISTS uq_tenant_modules_tenant_module ON tenant_modules(tenant_id, module_key);

-- =============================================================================
-- Domain 3b — projects (must precede other Domain 3 FKs)
-- =============================================================================

CREATE TABLE IF NOT EXISTS projects (
    id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name          VARCHAR(255)  NOT NULL,
    description   TEXT,
    status        VARCHAR(50)   NOT NULL DEFAULT 'active',
    industry      VARCHAR(100),
    company_size  VARCHAR(50),
    region        VARCHAR(100),
    created_by    UUID          REFERENCES users(id) ON DELETE SET NULL,
    metadata      JSONB,
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_projects_tenant_id     ON projects(tenant_id);
CREATE INDEX IF NOT EXISTS ix_projects_tenant_status ON projects(tenant_id, status);

-- =============================================================================
-- Domain 3 — frameworks
-- =============================================================================

CREATE TABLE IF NOT EXISTS frameworks (
    id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID          NOT NULL REFERENCES tenants(id),
    name                VARCHAR(255)  NOT NULL,
    description         TEXT,
    framework_type      VARCHAR(100),
    status              VARCHAR(50)   NOT NULL DEFAULT 'draft',
    is_template         BOOLEAN       NOT NULL DEFAULT false,
    source_document_id  UUID,
    metadata            JSONB,
    created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_frameworks_tenant_id ON frameworks(tenant_id);


CREATE TABLE IF NOT EXISTS framework_components (
    id              SERIAL PRIMARY KEY,
    framework_id    UUID          NOT NULL REFERENCES frameworks(id) ON DELETE CASCADE,
    code            VARCHAR(100)  NOT NULL,
    name            VARCHAR(255)  NOT NULL,
    description     TEXT,
    parent_id       INTEGER       REFERENCES framework_components(id) ON DELETE SET NULL,
    level           INTEGER,
    maturity_level  VARCHAR(50)   NOT NULL DEFAULT 'initial',
    criteria        JSONB,
    sort_order      INTEGER       NOT NULL DEFAULT 0
);

CREATE INDEX        IF NOT EXISTS ix_framework_components_framework_id ON framework_components(framework_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_framework_components_code         ON framework_components(framework_id, code);


CREATE TABLE IF NOT EXISTS framework_reviews (
    id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    project_id    UUID          NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    framework_id  UUID          NOT NULL REFERENCES frameworks(id) ON DELETE CASCADE,
    name          VARCHAR(255)  NOT NULL,
    status        VARCHAR(50)   NOT NULL DEFAULT 'draft',
    review_type   VARCHAR(50)   NOT NULL DEFAULT 'full',
    scope         JSONB,
    started_at    TIMESTAMPTZ,
    completed_at  TIMESTAMPTZ,
    metadata      JSONB,
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_framework_reviews_tenant_id    ON framework_reviews(tenant_id);
CREATE INDEX IF NOT EXISTS ix_framework_reviews_project_id   ON framework_reviews(project_id);
CREATE INDEX IF NOT EXISTS ix_framework_reviews_framework_id ON framework_reviews(framework_id);


CREATE TABLE IF NOT EXISTS review_runs (
    id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    review_id       UUID          NOT NULL REFERENCES framework_reviews(id) ON DELETE CASCADE,
    tenant_id       UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    status          VARCHAR(50)   NOT NULL DEFAULT 'pending',
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    error_message   TEXT,
    output_data     JSONB,
    metadata        JSONB,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_review_runs_review_id ON review_runs(review_id);
CREATE INDEX IF NOT EXISTS ix_review_runs_tenant_id ON review_runs(tenant_id);


CREATE TABLE IF NOT EXISTS extracted_frameworks (
    id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    source_document_id  UUID,  -- FK to project_documents added in a later phase
    extraction_method   VARCHAR(50)   NOT NULL DEFAULT 'manual',
    status              VARCHAR(50)   NOT NULL DEFAULT 'draft',
    extracted_data      JSONB,
    confidence          NUMERIC,
    metadata            JSONB,
    created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_extracted_frameworks_tenant_id ON extracted_frameworks(tenant_id);

-- =============================================================================
-- Domain 3 — capability frameworks / items / assessments / ratings / tags
-- =============================================================================

CREATE TABLE IF NOT EXISTS capability_frameworks (
    id                 UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id          UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name               VARCHAR(255)  NOT NULL,
    description        TEXT,
    framework_type     VARCHAR(100),
    proficiency_scale  JSONB         NOT NULL DEFAULT '[
        {"level": 0, "label": "Not Applicable"},
        {"level": 1, "label": "Awareness"},
        {"level": 2, "label": "Working"},
        {"level": 3, "label": "Practitioner"},
        {"level": 4, "label": "Advanced"},
        {"level": 5, "label": "Expert"}
    ]'::jsonb,
    is_template        BOOLEAN       NOT NULL DEFAULT false,
    metadata           JSONB,
    created_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_capability_frameworks_tenant_id ON capability_frameworks(tenant_id);


CREATE TABLE IF NOT EXISTS capability_framework_items (
    id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    framework_id  UUID          NOT NULL REFERENCES capability_frameworks(id) ON DELETE CASCADE,
    code          VARCHAR(100)  NOT NULL,
    name          VARCHAR(255)  NOT NULL,
    description   TEXT,
    category      VARCHAR(100),
    parent_id     UUID          REFERENCES capability_framework_items(id) ON DELETE SET NULL,
    level         INTEGER,
    sort_order    INTEGER       NOT NULL DEFAULT 0,
    metadata      JSONB,
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX        IF NOT EXISTS ix_capability_framework_items_framework_id ON capability_framework_items(framework_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_capability_framework_items_code         ON capability_framework_items(framework_id, code);


CREATE TABLE IF NOT EXISTS capability_assessments (
    id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    framework_id      UUID          NOT NULL REFERENCES capability_frameworks(id) ON DELETE CASCADE,
    -- role_profile_id FK -> role_capability_profiles (deferred to later phase)
    role_profile_id   UUID,
    subject_type      VARCHAR(50)   NOT NULL,
    subject_ref       VARCHAR(255),
    status            VARCHAR(50)   NOT NULL DEFAULT 'draft',
    rating_source     VARCHAR(50)   NOT NULL DEFAULT 'self',
    assessor_user_id  UUID          REFERENCES users(id) ON DELETE SET NULL,
    completed_at      TIMESTAMPTZ,
    metadata          JSONB,
    created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_capability_assessments_tenant_id    ON capability_assessments(tenant_id);
CREATE INDEX IF NOT EXISTS ix_capability_assessments_framework_id ON capability_assessments(framework_id);


CREATE TABLE IF NOT EXISTS capability_ratings (
    id                 UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    assessment_id      UUID          NOT NULL REFERENCES capability_assessments(id) ON DELETE CASCADE,
    framework_item_id  UUID          NOT NULL REFERENCES capability_framework_items(id) ON DELETE CASCADE,
    current_level      INTEGER,
    target_level       INTEGER,
    evidence           TEXT,
    priority           VARCHAR(50),
    confidence         VARCHAR(50),
    notes              TEXT,
    metadata           JSONB,
    created_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX        IF NOT EXISTS ix_capability_ratings_assessment_id      ON capability_ratings(assessment_id);
CREATE INDEX        IF NOT EXISTS ix_capability_ratings_framework_item_id  ON capability_ratings(framework_item_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_capability_ratings_assessment_item    ON capability_ratings(assessment_id, framework_item_id);


CREATE TABLE IF NOT EXISTS skill_tags (
    id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    scope       VARCHAR(50)   NOT NULL,
    tenant_id   UUID          REFERENCES tenants(id) ON DELETE CASCADE,
    code        VARCHAR(100)  NOT NULL,
    label       VARCHAR(255)  NOT NULL,
    category    VARCHAR(50)   NOT NULL DEFAULT 'general',
    metadata    JSONB,
    created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX        IF NOT EXISTS ix_skill_tags_tenant_id          ON skill_tags(tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_skill_tags_scope_tenant_code  ON skill_tags(scope, tenant_id, code);


CREATE TABLE IF NOT EXISTS framework_item_tags (
    framework_item_id  UUID  NOT NULL REFERENCES capability_framework_items(id) ON DELETE CASCADE,
    tag_id             UUID  NOT NULL REFERENCES skill_tags(id) ON DELETE CASCADE,
    PRIMARY KEY (framework_item_id, tag_id)
);

CREATE INDEX IF NOT EXISTS ix_framework_item_tags_tag_id ON framework_item_tags(tag_id);

-- =============================================================================
-- Domain 3 — diagnostics & target state
-- =============================================================================

CREATE TABLE IF NOT EXISTS diagnostic_results (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    project_id      UUID         NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    diagnostic_type VARCHAR(100) NOT NULL,
    status          VARCHAR(50)  NOT NULL DEFAULT 'pending',
    input_data      JSONB,
    output_data     JSONB,
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    metadata        JSONB,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_diagnostic_results_tenant_id  ON diagnostic_results(tenant_id);
CREATE INDEX IF NOT EXISTS ix_diagnostic_results_project_id ON diagnostic_results(project_id);


CREATE TABLE IF NOT EXISTS target_state_designs (
    id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id      UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    project_id     UUID          NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    framework_id   UUID          REFERENCES frameworks(id) ON DELETE SET NULL,
    name           VARCHAR(255)  NOT NULL,
    description    TEXT,
    status         VARCHAR(50)   NOT NULL DEFAULT 'draft',
    design_data    JSONB,
    version        INTEGER       NOT NULL DEFAULT 1,
    supersedes_id  UUID          REFERENCES target_state_designs(id) ON DELETE SET NULL,
    metadata       JSONB,
    created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_target_state_designs_tenant_id  ON target_state_designs(tenant_id);
CREATE INDEX IF NOT EXISTS ix_target_state_designs_project_id ON target_state_designs(project_id);

-- =============================================================================
-- Domain 10 — activity log (audit_logs intentionally NOT ported — covered by
-- existing app.services.audit)
-- =============================================================================

CREATE TABLE IF NOT EXISTS activity_log (
    id             SERIAL PRIMARY KEY,
    tenant_id      UUID          NOT NULL REFERENCES tenants(id),
    actor_user_id  UUID          REFERENCES users(id) ON DELETE SET NULL,
    action         VARCHAR(100)  NOT NULL,
    entity_type    VARCHAR(100)  NOT NULL,
    entity_id      TEXT,
    summary        TEXT,
    metadata       JSONB,
    created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_activity_log_tenant_created ON activity_log(tenant_id, created_at DESC);
