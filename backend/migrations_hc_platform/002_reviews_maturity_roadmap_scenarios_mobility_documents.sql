-- =============================================================================
-- HC Platform port — Phase 2 migration
-- =============================================================================
-- Domains 4 (HC reviews + AI), 5 (maturity + benchmarks), 6 (roadmaps +
-- recommendations), 7 (scenarios), 8 (mobility), 9 (documents + exports).
-- Idempotent. Run AFTER 001_foundations.sql.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =============================================================================
-- Domain 4 — HC reviews & AI analysis
-- =============================================================================

CREATE TABLE IF NOT EXISTS hc_reviews (
    id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    project_id          UUID          REFERENCES projects(id) ON DELETE CASCADE,
    company_name        VARCHAR(255),
    status              VARCHAR(50)   NOT NULL DEFAULT 'draft',
    review_type         VARCHAR(50)   NOT NULL DEFAULT 'full_hc_review',
    company_size        VARCHAR(50),
    region              VARCHAR(100),
    industry            VARCHAR(100),
    intake_data         JSONB,
    diagnostic_results  JSONB,
    target_state        JSONB,
    roadmap             JSONB,
    created_by          UUID          REFERENCES users(id) ON DELETE SET NULL,
    metadata            JSONB,
    created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_hc_reviews_tenant_id  ON hc_reviews(tenant_id);
CREATE INDEX IF NOT EXISTS ix_hc_reviews_project_id ON hc_reviews(project_id);


CREATE TABLE IF NOT EXISTS hc_analysis_versions (
    id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    review_id           UUID          NOT NULL REFERENCES hc_reviews(id) ON DELETE CASCADE,
    version             INTEGER       NOT NULL,
    generator_type      VARCHAR(50)   NOT NULL DEFAULT 'mock',
    confidence_level    VARCHAR(50),
    content             JSONB,
    prompt_fingerprint  VARCHAR(255),
    metadata            JSONB,
    created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX        IF NOT EXISTS ix_hc_analysis_versions_review_id      ON hc_analysis_versions(review_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_hc_analysis_versions_review_version ON hc_analysis_versions(review_id, version);


CREATE TABLE IF NOT EXISTS ai_generated_insights (
    id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    review_id           UUID          NOT NULL REFERENCES hc_reviews(id) ON DELETE CASCADE,
    insight_type        VARCHAR(100)  NOT NULL,
    generator_type      VARCHAR(50)   NOT NULL DEFAULT 'mock',
    content             JSONB,
    prompt_fingerprint  VARCHAR(255),
    model_name          VARCHAR(100),
    tokens_used         INTEGER,
    metadata            JSONB,
    created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_ai_generated_insights_tenant_id           ON ai_generated_insights(tenant_id);
CREATE INDEX IF NOT EXISTS ix_ai_generated_insights_review_id           ON ai_generated_insights(review_id);
CREATE INDEX IF NOT EXISTS ix_ai_generated_insights_review_insight_type ON ai_generated_insights(review_id, insight_type);


CREATE TABLE IF NOT EXISTS ai_prompt_templates (
    id                    SERIAL PRIMARY KEY,
    key                   VARCHAR(255)  NOT NULL UNIQUE,
    version               INTEGER       NOT NULL DEFAULT 1,
    insight_type          VARCHAR(100),
    system_prompt         TEXT,
    user_prompt_template  TEXT,
    model_name            VARCHAR(100),
    temperature           NUMERIC,
    max_tokens            INTEGER,
    response_format       VARCHAR(50),
    allowed_modules       JSONB,
    is_active             BOOLEAN       NOT NULL DEFAULT true,
    metadata              JSONB,
    created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_prompt_templates_key_version ON ai_prompt_templates(key, version);


CREATE TABLE IF NOT EXISTS review_documents (
    id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    review_id    UUID          NOT NULL REFERENCES hc_reviews(id) ON DELETE CASCADE,
    category     VARCHAR(100)  NOT NULL DEFAULT 'supporting_evidence',
    name         VARCHAR(255)  NOT NULL,
    description  TEXT,
    source_url   TEXT,
    file_path    TEXT,
    mime_type    VARCHAR(100),
    metadata     JSONB,
    uploaded_by  UUID          REFERENCES users(id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_review_documents_tenant_id ON review_documents(tenant_id);
CREATE INDEX IF NOT EXISTS ix_review_documents_review_id ON review_documents(review_id);

-- =============================================================================
-- Domain 5 — maturity models / bands / assessments / dimension results
-- =============================================================================

CREATE TABLE IF NOT EXISTS maturity_models (
    id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    key          VARCHAR(100)  NOT NULL UNIQUE,
    name         VARCHAR(255)  NOT NULL,
    description  TEXT,
    dimensions   JSONB,
    is_global    BOOLEAN       NOT NULL DEFAULT true,
    version      INTEGER       NOT NULL DEFAULT 1,
    metadata     JSONB,
    created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);


CREATE TABLE IF NOT EXISTS maturity_bands (
    id                 UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    maturity_model_id  UUID          NOT NULL REFERENCES maturity_models(id) ON DELETE CASCADE,
    band_name          VARCHAR(100)  NOT NULL,
    min_score          NUMERIC,
    max_score          NUMERIC,
    narrative          TEXT,
    sort_order         INTEGER       NOT NULL DEFAULT 0,
    created_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX        IF NOT EXISTS ix_maturity_bands_model_id   ON maturity_bands(maturity_model_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_maturity_bands_model_name ON maturity_bands(maturity_model_id, band_name);


CREATE TABLE IF NOT EXISTS maturity_assessments (
    id                 UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id          UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    review_id          UUID          NOT NULL REFERENCES hc_reviews(id) ON DELETE CASCADE,
    maturity_model_id  UUID          NOT NULL REFERENCES maturity_models(id),
    overall_score      NUMERIC,
    overall_band       VARCHAR(100),
    computed_at        TIMESTAMPTZ,
    inputs_hash        VARCHAR(255),
    metadata           JSONB,
    created_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_maturity_assessments_tenant_id ON maturity_assessments(tenant_id);
CREATE INDEX IF NOT EXISTS ix_maturity_assessments_review_id ON maturity_assessments(review_id);


CREATE TABLE IF NOT EXISTS maturity_dimension_results (
    id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    assessment_id   UUID          NOT NULL REFERENCES maturity_assessments(id) ON DELETE CASCADE,
    dimension_key   VARCHAR(100)  NOT NULL,
    score           NUMERIC,
    band_name       VARCHAR(100),
    criticality     VARCHAR(50),
    readiness       VARCHAR(50),
    narrative       TEXT,
    metadata        JSONB
);

CREATE INDEX        IF NOT EXISTS ix_maturity_dimension_results_assessment_id   ON maturity_dimension_results(assessment_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_maturity_dimension_results_assessment_dim ON maturity_dimension_results(assessment_id, dimension_key);

-- =============================================================================
-- Domain 5 — benchmarks
-- =============================================================================

CREATE TABLE IF NOT EXISTS benchmark_profiles (
    id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    key             VARCHAR(100)  NOT NULL UNIQUE,
    name            VARCHAR(255)  NOT NULL,
    description     TEXT,
    benchmark_type  VARCHAR(50)   NOT NULL DEFAULT 'industry',
    industry        VARCHAR(100),
    region          VARCHAR(100),
    company_size    VARCHAR(50),
    source          VARCHAR(255),
    metadata        JSONB,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);


CREATE TABLE IF NOT EXISTS benchmark_dimension_scores (
    id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    benchmark_profile_id  UUID          NOT NULL REFERENCES benchmark_profiles(id) ON DELETE CASCADE,
    dimension_key         VARCHAR(100)  NOT NULL,
    score                 NUMERIC,
    percentile            NUMERIC,
    sample_size           INTEGER,
    metadata              JSONB
);

CREATE INDEX        IF NOT EXISTS ix_benchmark_dimension_scores_profile_id  ON benchmark_dimension_scores(benchmark_profile_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_benchmark_dimension_scores_profile_dim ON benchmark_dimension_scores(benchmark_profile_id, dimension_key);


CREATE TABLE IF NOT EXISTS benchmark_comparisons (
    id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    review_id             UUID          NOT NULL REFERENCES hc_reviews(id) ON DELETE CASCADE,
    benchmark_profile_id  UUID          NOT NULL REFERENCES benchmark_profiles(id),
    comparison_data       JSONB,
    overall_positioning   TEXT,
    gap_data              JSONB,
    computed_at           TIMESTAMPTZ,
    metadata              JSONB,
    created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_benchmark_comparisons_tenant_id ON benchmark_comparisons(tenant_id);
CREATE INDEX IF NOT EXISTS ix_benchmark_comparisons_review_id ON benchmark_comparisons(review_id);


CREATE TABLE IF NOT EXISTS benchmark_groups (
    id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    key         VARCHAR(100)  NOT NULL UNIQUE,
    name        VARCHAR(255)  NOT NULL,
    group_type  VARCHAR(100),
    members     JSONB,
    metadata    JSONB,
    created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- Domain 6 — recommendation library (BEFORE roadmap_recommendations FK)
-- =============================================================================

CREATE TABLE IF NOT EXISTS recommendation_library (
    id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    key               VARCHAR(100)  NOT NULL UNIQUE,
    title             VARCHAR(255)  NOT NULL,
    description       TEXT,
    category          VARCHAR(100),
    time_horizon      VARCHAR(50),
    tier              VARCHAR(50),
    default_impact    VARCHAR(50),
    default_effort    VARCHAR(50),
    tags              JSONB,
    evidence_sources  JSONB,
    is_global         BOOLEAN       NOT NULL DEFAULT true,
    metadata          JSONB,
    created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- Domain 6 — roadmaps
-- =============================================================================

CREATE TABLE IF NOT EXISTS roadmaps (
    id                      UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    project_id              UUID          REFERENCES projects(id) ON DELETE CASCADE,
    name                    VARCHAR(255)  NOT NULL,
    description             TEXT,
    status                  VARCHAR(50)   NOT NULL DEFAULT 'draft',
    target_state_design_id  UUID          REFERENCES target_state_designs(id) ON DELETE SET NULL,
    metadata                JSONB,
    created_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_roadmaps_tenant_id  ON roadmaps(tenant_id);
CREATE INDEX IF NOT EXISTS ix_roadmaps_project_id ON roadmaps(project_id);


CREATE TABLE IF NOT EXISTS roadmap_outputs (
    id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    review_id     UUID          NOT NULL REFERENCES hc_reviews(id) ON DELETE CASCADE,
    version       INTEGER       NOT NULL DEFAULT 1,
    output_data   JSONB,
    computed_at   TIMESTAMPTZ,
    metadata      JSONB,
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_roadmap_outputs_tenant_id ON roadmap_outputs(tenant_id);
CREATE INDEX IF NOT EXISTS ix_roadmap_outputs_review_id ON roadmap_outputs(review_id);


CREATE TABLE IF NOT EXISTS roadmap_phases (
    id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id      UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    review_id      UUID          NOT NULL REFERENCES hc_reviews(id) ON DELETE CASCADE,
    name           VARCHAR(255)  NOT NULL,
    sort_order     INTEGER       NOT NULL DEFAULT 0,
    start_horizon  VARCHAR(50),
    end_horizon    VARCHAR(50),
    narrative      TEXT,
    metadata       JSONB,
    created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_roadmap_phases_tenant_id ON roadmap_phases(tenant_id);
CREATE INDEX IF NOT EXISTS ix_roadmap_phases_review_id ON roadmap_phases(review_id);


CREATE TABLE IF NOT EXISTS roadmap_recommendations (
    id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    review_id           UUID          NOT NULL REFERENCES hc_reviews(id) ON DELETE CASCADE,
    recommendation_id   UUID          REFERENCES recommendation_library(id) ON DELETE SET NULL,
    phase_id            UUID          REFERENCES roadmap_phases(id) ON DELETE SET NULL,
    tier                VARCHAR(50),
    category            VARCHAR(100),
    title               VARCHAR(255)  NOT NULL,
    description         TEXT,
    impact              TEXT,
    effort              TEXT,
    dependencies        JSONB,
    time_horizon        VARCHAR(50),
    evidence            JSONB,
    narrative           TEXT,
    metadata            JSONB,
    sort_order          INTEGER       NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_roadmap_recommendations_tenant_id ON roadmap_recommendations(tenant_id);
CREATE INDEX IF NOT EXISTS ix_roadmap_recommendations_review_id ON roadmap_recommendations(review_id);

-- =============================================================================
-- Domain 7 — scenarios
-- =============================================================================

CREATE TABLE IF NOT EXISTS scenario_models (
    id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    review_id             UUID          REFERENCES hc_reviews(id) ON DELETE CASCADE,
    scenario_type         VARCHAR(100),
    name                  VARCHAR(255)  NOT NULL,
    status                VARCHAR(50)   NOT NULL DEFAULT 'draft',
    assumptions_summary   JSONB,
    metadata              JSONB,
    created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_scenario_models_tenant_id ON scenario_models(tenant_id);
CREATE INDEX IF NOT EXISTS ix_scenario_models_review_id ON scenario_models(review_id);


CREATE TABLE IF NOT EXISTS scenario_assumptions (
    id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    scenario_id  UUID          NOT NULL REFERENCES scenario_models(id) ON DELETE CASCADE,
    key          VARCHAR(100)  NOT NULL,
    label        VARCHAR(255),
    value        JSONB,
    unit         VARCHAR(50),
    source       VARCHAR(255),
    metadata     JSONB,
    sort_order   INTEGER       NOT NULL DEFAULT 0
);

CREATE INDEX        IF NOT EXISTS ix_scenario_assumptions_scenario_id     ON scenario_assumptions(scenario_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_scenario_assumptions_scenario_key    ON scenario_assumptions(scenario_id, key);


CREATE TABLE IF NOT EXISTS scenario_outputs (
    id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    scenario_id   UUID          NOT NULL REFERENCES scenario_models(id) ON DELETE CASCADE,
    period_label  VARCHAR(100),
    output_data   JSONB,
    computed_at   TIMESTAMPTZ,
    metadata      JSONB,
    sort_order    INTEGER       NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS ix_scenario_outputs_scenario_id ON scenario_outputs(scenario_id);


CREATE TABLE IF NOT EXISTS scenario_risk_flags (
    id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    scenario_id  UUID          NOT NULL REFERENCES scenario_models(id) ON DELETE CASCADE,
    severity     VARCHAR(50),
    label        VARCHAR(255),
    description  TEXT,
    mitigation   TEXT,
    metadata     JSONB
);

CREATE INDEX IF NOT EXISTS ix_scenario_risk_flags_scenario_id ON scenario_risk_flags(scenario_id);


CREATE TABLE IF NOT EXISTS scenario_templates (
    id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    scenario_type         VARCHAR(100)  NOT NULL UNIQUE,
    name                  VARCHAR(255)  NOT NULL,
    description           TEXT,
    default_assumptions   JSONB,
    formula_ref           VARCHAR(255),
    metadata              JSONB,
    created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- Domain 8 — role profiles (must precede capability_assessments FK + mobility)
-- =============================================================================

CREATE TABLE IF NOT EXISTS role_capability_profiles (
    id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id        UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    framework_id     UUID          REFERENCES capability_frameworks(id) ON DELETE SET NULL,
    role_code        VARCHAR(100)  NOT NULL,
    role_name        VARCHAR(255)  NOT NULL,
    role_family      VARCHAR(100),
    career_level     VARCHAR(50),
    job_level        VARCHAR(50),
    function         VARCHAR(100),
    leadership_tier  VARCHAR(50),
    criticality      VARCHAR(50)   NOT NULL DEFAULT 'standard',
    source           VARCHAR(50)   NOT NULL DEFAULT 'manual',
    metadata         JSONB,
    created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX        IF NOT EXISTS ix_role_capability_profiles_tenant_id   ON role_capability_profiles(tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_role_capability_profiles_tenant_code ON role_capability_profiles(tenant_id, role_code);


-- Now that role_capability_profiles exists, add the deferred FK on
-- capability_assessments.role_profile_id (placeholder col was created in 001).
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'fk_capability_assessments_role_profile'
    ) THEN
        ALTER TABLE capability_assessments
            ADD CONSTRAINT fk_capability_assessments_role_profile
            FOREIGN KEY (role_profile_id)
            REFERENCES role_capability_profiles(id)
            ON DELETE SET NULL;
    END IF;
END $$;


CREATE TABLE IF NOT EXISTS role_capability_requirements (
    id                 UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    role_profile_id    UUID          NOT NULL REFERENCES role_capability_profiles(id) ON DELETE CASCADE,
    framework_item_id  UUID          NOT NULL REFERENCES capability_framework_items(id) ON DELETE CASCADE,
    required_level     INTEGER,
    priority           VARCHAR(50),
    weight             NUMERIC,
    metadata           JSONB
);

CREATE INDEX        IF NOT EXISTS ix_role_capability_requirements_role_id      ON role_capability_requirements(role_profile_id);
CREATE INDEX        IF NOT EXISTS ix_role_capability_requirements_item_id      ON role_capability_requirements(framework_item_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_role_capability_requirements_role_item    ON role_capability_requirements(role_profile_id, framework_item_id);


CREATE TABLE IF NOT EXISTS role_adjacencies (
    id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    from_role_profile_id  UUID          NOT NULL REFERENCES role_capability_profiles(id) ON DELETE CASCADE,
    to_role_profile_id    UUID          NOT NULL REFERENCES role_capability_profiles(id) ON DELETE CASCADE,
    type                  VARCHAR(50),
    distance              NUMERIC,
    rationale             VARCHAR(1024),
    metadata              JSONB
);

CREATE INDEX        IF NOT EXISTS ix_role_adjacencies_tenant_id           ON role_adjacencies(tenant_id);
CREATE INDEX        IF NOT EXISTS ix_role_adjacencies_from_role           ON role_adjacencies(from_role_profile_id);
CREATE INDEX        IF NOT EXISTS ix_role_adjacencies_to_role             ON role_adjacencies(to_role_profile_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_role_adjacencies_from_to_type        ON role_adjacencies(from_role_profile_id, to_role_profile_id, type);


CREATE TABLE IF NOT EXISTS role_mobility_facets (
    id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    role_profile_id   UUID          NOT NULL REFERENCES role_capability_profiles(id) ON DELETE CASCADE,
    leadership_tier   VARCHAR(50),
    criticality       VARCHAR(50)   NOT NULL DEFAULT 'standard',
    source            VARCHAR(50)   NOT NULL DEFAULT 'manual',
    metadata          JSONB
);

CREATE INDEX        IF NOT EXISTS ix_role_mobility_facets_tenant_id ON role_mobility_facets(tenant_id);
CREATE INDEX        IF NOT EXISTS ix_role_mobility_facets_role_id   ON role_mobility_facets(role_profile_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_role_mobility_facets_role      ON role_mobility_facets(role_profile_id);

-- =============================================================================
-- Domain 8 — career paths
-- =============================================================================

CREATE TABLE IF NOT EXISTS career_paths (
    id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name         VARCHAR(255)  NOT NULL,
    description  TEXT,
    path_type    VARCHAR(100),
    metadata     JSONB,
    created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_career_paths_tenant_id ON career_paths(tenant_id);


CREATE TABLE IF NOT EXISTS career_path_stops (
    id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    career_path_id        UUID          NOT NULL REFERENCES career_paths(id) ON DELETE CASCADE,
    role_profile_id       UUID          REFERENCES role_capability_profiles(id) ON DELETE SET NULL,
    sort_order            INTEGER       NOT NULL DEFAULT 0,
    time_in_role_months   INTEGER,
    prerequisites         JSONB,
    metadata              JSONB
);

CREATE INDEX        IF NOT EXISTS ix_career_path_stops_career_path_id ON career_path_stops(career_path_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_career_path_stops_path_order     ON career_path_stops(career_path_id, sort_order);

-- =============================================================================
-- Domain 8 — mobility
-- =============================================================================

CREATE TABLE IF NOT EXISTS mobility_frameworks (
    id                   UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id            UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name                 VARCHAR(255)  NOT NULL,
    mode                 VARCHAR(50)   NOT NULL DEFAULT 'hybrid',
    fit_weights          JSONB,
    eligibility_rules    JSONB,
    metadata             JSONB,
    created_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_mobility_frameworks_tenant_id ON mobility_frameworks(tenant_id);


CREATE TABLE IF NOT EXISTS employee_mobility_profiles (
    id                       UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    employee_ref             VARCHAR(255)  NOT NULL,
    current_role_profile_id  UUID          REFERENCES role_capability_profiles(id) ON DELETE SET NULL,
    performance_tier         VARCHAR(50)   NOT NULL DEFAULT 'meets',
    readiness                VARCHAR(50)   NOT NULL DEFAULT 'ready_24_months',
    source                   VARCHAR(50)   NOT NULL DEFAULT 'manual',
    tenure_months            INTEGER,
    metadata                 JSONB,
    created_at               TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at               TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX        IF NOT EXISTS ix_employee_mobility_profiles_tenant_id    ON employee_mobility_profiles(tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_employee_mobility_profiles_tenant_ref   ON employee_mobility_profiles(tenant_id, employee_ref);


CREATE TABLE IF NOT EXISTS mobility_opportunities (
    id                       UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    target_role_profile_id   UUID          REFERENCES role_capability_profiles(id) ON DELETE SET NULL,
    name                     VARCHAR(255)  NOT NULL,
    type                     VARCHAR(100),
    status                   VARCHAR(50)   NOT NULL DEFAULT 'open',
    start_date               DATE,
    end_date                 DATE,
    location                 VARCHAR(255),
    metadata                 JSONB,
    created_at               TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at               TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_mobility_opportunities_tenant_id ON mobility_opportunities(tenant_id);


CREATE TABLE IF NOT EXISTS mobility_opportunity_requirements (
    id                 UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    opportunity_id     UUID          NOT NULL REFERENCES mobility_opportunities(id) ON DELETE CASCADE,
    framework_item_id  UUID          NOT NULL REFERENCES capability_framework_items(id) ON DELETE CASCADE,
    required_level     INTEGER,
    weight             NUMERIC,
    metadata           JSONB
);

CREATE INDEX        IF NOT EXISTS ix_mobility_opportunity_requirements_opp_id   ON mobility_opportunity_requirements(opportunity_id);
CREATE INDEX        IF NOT EXISTS ix_mobility_opportunity_requirements_item_id  ON mobility_opportunity_requirements(framework_item_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_mobility_opportunity_requirements_opp_item ON mobility_opportunity_requirements(opportunity_id, framework_item_id);


CREATE TABLE IF NOT EXISTS mobility_match_results (
    id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    profile_id      UUID          NOT NULL REFERENCES employee_mobility_profiles(id) ON DELETE CASCADE,
    opportunity_id  UUID          NOT NULL REFERENCES mobility_opportunities(id) ON DELETE CASCADE,
    engine          VARCHAR(50)   NOT NULL DEFAULT 'deterministic_v1',
    weights_hash    VARCHAR(255),
    inputs_hash     VARCHAR(255),
    score           NUMERIC,
    verdict         VARCHAR(50),
    breakdown       JSONB,
    computed_at     TIMESTAMPTZ,
    metadata        JSONB
);

CREATE INDEX        IF NOT EXISTS ix_mobility_match_results_tenant_id            ON mobility_match_results(tenant_id);
CREATE INDEX        IF NOT EXISTS ix_mobility_match_results_profile_id           ON mobility_match_results(profile_id);
CREATE INDEX        IF NOT EXISTS ix_mobility_match_results_opportunity_id       ON mobility_match_results(opportunity_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_mobility_match_results_profile_opp_engine   ON mobility_match_results(profile_id, opportunity_id, engine, weights_hash, inputs_hash);


CREATE TABLE IF NOT EXISTS mobility_movements (
    id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    profile_id            UUID          NOT NULL REFERENCES employee_mobility_profiles(id) ON DELETE CASCADE,
    opportunity_id        UUID          REFERENCES mobility_opportunities(id) ON DELETE SET NULL,
    from_role_profile_id  UUID          REFERENCES role_capability_profiles(id) ON DELETE SET NULL,
    to_role_profile_id    UUID          REFERENCES role_capability_profiles(id) ON DELETE SET NULL,
    movement_type         VARCHAR(50),
    status                VARCHAR(50)   NOT NULL DEFAULT 'proposed',
    outcome               VARCHAR(50),
    started_at            TIMESTAMPTZ,
    completed_at          TIMESTAMPTZ,
    metadata              JSONB,
    created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_mobility_movements_tenant_id  ON mobility_movements(tenant_id);
CREATE INDEX IF NOT EXISTS ix_mobility_movements_profile_id ON mobility_movements(profile_id);


CREATE TABLE IF NOT EXISTS mobility_movement_events (
    id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    movement_id    UUID          NOT NULL REFERENCES mobility_movements(id) ON DELETE CASCADE,
    event_type     VARCHAR(100)  NOT NULL,
    payload        JSONB,
    actor_user_id  UUID          REFERENCES users(id) ON DELETE SET NULL,
    created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_mobility_movement_events_movement_id ON mobility_movement_events(movement_id);


CREATE TABLE IF NOT EXISTS mobility_preferences (
    id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id  UUID          NOT NULL REFERENCES employee_mobility_profiles(id) ON DELETE CASCADE,
    kind        VARCHAR(100),
    value       JSONB,
    weight      NUMERIC,
    metadata    JSONB
);

CREATE INDEX IF NOT EXISTS ix_mobility_preferences_profile_id ON mobility_preferences(profile_id);


CREATE TABLE IF NOT EXISTS mobility_readiness_assessments (
    id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    profile_id   UUID          NOT NULL REFERENCES employee_mobility_profiles(id) ON DELETE CASCADE,
    readiness    VARCHAR(50),
    source       VARCHAR(50)   NOT NULL DEFAULT 'manager',
    notes        TEXT,
    assessed_at  TIMESTAMPTZ,
    metadata     JSONB,
    created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_mobility_readiness_assessments_tenant_id  ON mobility_readiness_assessments(tenant_id);
CREATE INDEX IF NOT EXISTS ix_mobility_readiness_assessments_profile_id ON mobility_readiness_assessments(profile_id);


CREATE TABLE IF NOT EXISTS mobility_eligibility_rules (
    id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    owner_kind  VARCHAR(50),
    owner_ref   VARCHAR(255),
    rule        JSONB,
    is_active   BOOLEAN       NOT NULL DEFAULT true,
    metadata    JSONB,
    created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_mobility_eligibility_rules_tenant_id ON mobility_eligibility_rules(tenant_id);


CREATE TABLE IF NOT EXISTS mobility_barriers (
    id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    scope        VARCHAR(50),
    scope_ref    VARCHAR(255),
    type         VARCHAR(100),
    severity     VARCHAR(50)   NOT NULL DEFAULT 'medium',
    description  TEXT,
    mitigation   TEXT,
    metadata     JSONB,
    created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_mobility_barriers_tenant_id ON mobility_barriers(tenant_id);


CREATE TABLE IF NOT EXISTS mobility_rollups (
    id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    scope         VARCHAR(50),
    scope_ref     VARCHAR(255),
    period_label  VARCHAR(100),
    metrics       JSONB,
    computed_at   TIMESTAMPTZ,
    metadata      JSONB,
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX        IF NOT EXISTS ix_mobility_rollups_tenant_id              ON mobility_rollups(tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_mobility_rollups_tenant_scope_period    ON mobility_rollups(tenant_id, scope, scope_ref, period_label);


CREATE TABLE IF NOT EXISTS mobility_move_types (
    code         VARCHAR(50)   PRIMARY KEY,
    label        VARCHAR(255),
    description  TEXT,
    metadata     JSONB
);


CREATE TABLE IF NOT EXISTS mobility_kpi_dictionary (
    key          VARCHAR(100)  PRIMARY KEY,
    label        VARCHAR(255),
    description  TEXT,
    unit         VARCHAR(50),
    formula      TEXT,
    metadata     JSONB
);


CREATE TABLE IF NOT EXISTS talent_visibility_signals (
    id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    profile_id  UUID          NOT NULL REFERENCES employee_mobility_profiles(id) ON DELETE CASCADE,
    kind        VARCHAR(100),
    weight      NUMERIC,
    source      VARCHAR(100),
    evidence    JSONB,
    expires_at  TIMESTAMPTZ,
    metadata    JSONB,
    created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_talent_visibility_signals_tenant_id  ON talent_visibility_signals(tenant_id);
CREATE INDEX IF NOT EXISTS ix_talent_visibility_signals_profile_id ON talent_visibility_signals(profile_id);

-- =============================================================================
-- Domain 9 — document categories / project docs / template engine / generation
-- =============================================================================

CREATE TABLE IF NOT EXISTS document_categories (
    id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    UUID          REFERENCES tenants(id) ON DELETE CASCADE,
    key          VARCHAR(100)  NOT NULL,
    label        VARCHAR(255)  NOT NULL,
    description  TEXT,
    sort_order   INTEGER       NOT NULL DEFAULT 0,
    metadata     JSONB,
    created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX        IF NOT EXISTS ix_document_categories_tenant_id      ON document_categories(tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_document_categories_tenant_key     ON document_categories(tenant_id, key);


CREATE TABLE IF NOT EXISTS project_documents (
    id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    project_id   UUID          NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    category_id  UUID          REFERENCES document_categories(id) ON DELETE SET NULL,
    name         VARCHAR(255)  NOT NULL,
    description  TEXT,
    file_path    TEXT,
    mime_type    VARCHAR(100),
    source_url   TEXT,
    metadata     JSONB,
    uploaded_by  UUID          REFERENCES users(id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_project_documents_tenant_id  ON project_documents(tenant_id);
CREATE INDEX IF NOT EXISTS ix_project_documents_project_id ON project_documents(project_id);


CREATE TABLE IF NOT EXISTS document_types (
    key                       VARCHAR(100)  PRIMARY KEY,
    label                     VARCHAR(255)  NOT NULL,
    description               TEXT,
    default_governance_tier   VARCHAR(50)   NOT NULL DEFAULT 'operational',
    metadata                  JSONB,
    created_at                TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at                TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);


CREATE TABLE IF NOT EXISTS document_templates (
    id                  VARCHAR(255)  PRIMARY KEY,
    document_type_key   VARCHAR(100)  REFERENCES document_types(key),
    name                VARCHAR(255)  NOT NULL,
    description         TEXT,
    status              VARCHAR(50)   NOT NULL DEFAULT 'active',
    code_ref            VARCHAR(255),
    metadata            JSONB,
    created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);


CREATE TABLE IF NOT EXISTS document_template_versions (
    id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id  VARCHAR(255)  NOT NULL REFERENCES document_templates(id) ON DELETE CASCADE,
    version      INTEGER       NOT NULL,
    code_ref     VARCHAR(255),
    sections     JSONB,
    metadata     JSONB,
    created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX        IF NOT EXISTS ix_document_template_versions_template_id      ON document_template_versions(template_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_document_template_versions_template_version ON document_template_versions(template_id, version);


CREATE TABLE IF NOT EXISTS document_export_profiles (
    id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    key         VARCHAR(100)  NOT NULL UNIQUE,
    name        VARCHAR(255)  NOT NULL,
    format      VARCHAR(50),
    options     JSONB,
    metadata    JSONB,
    created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);


CREATE TABLE IF NOT EXISTS module_document_bindings (
    id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    UUID          REFERENCES tenants(id) ON DELETE CASCADE,
    module_key   VARCHAR(100)  NOT NULL,
    template_id  VARCHAR(255)  NOT NULL REFERENCES document_templates(id) ON DELETE CASCADE,
    is_default   BOOLEAN       NOT NULL DEFAULT false,
    sort_order   INTEGER       NOT NULL DEFAULT 0,
    metadata     JSONB
);

CREATE INDEX        IF NOT EXISTS ix_module_document_bindings_tenant_id                  ON module_document_bindings(tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_module_document_bindings_tenant_module_template     ON module_document_bindings(tenant_id, module_key, template_id);


CREATE TABLE IF NOT EXISTS generation_profiles (
    id                          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                   UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    brand_voice                 VARCHAR(50)   NOT NULL DEFAULT 'formal_consultative',
    reading_level               VARCHAR(50)   NOT NULL DEFAULT 'manager',
    default_export_profile_id   UUID          REFERENCES document_export_profiles(id) ON DELETE SET NULL,
    metadata                    JSONB,
    created_at                  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_generation_profiles_tenant ON generation_profiles(tenant_id);


CREATE TABLE IF NOT EXISTS generated_documents (
    id                   UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id            UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    template_id          VARCHAR(255)  REFERENCES document_templates(id) ON DELETE SET NULL,
    document_type_key    VARCHAR(100)  REFERENCES document_types(key),
    category_id          UUID          REFERENCES document_categories(id) ON DELETE SET NULL,
    name                 VARCHAR(255)  NOT NULL,
    status               VARCHAR(50)   NOT NULL DEFAULT 'draft',
    ir_snapshot          JSONB,
    context_payload      JSONB,
    framework_snapshot   JSONB,
    ai_provider          VARCHAR(50)   NOT NULL DEFAULT 'noop',
    ai_provenance        JSONB,
    version              INTEGER       NOT NULL DEFAULT 1,
    created_by           UUID          REFERENCES users(id) ON DELETE SET NULL,
    metadata             JSONB,
    created_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_generated_documents_tenant_id ON generated_documents(tenant_id);


CREATE TABLE IF NOT EXISTS generated_document_section_overrides (
    id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    document_id  UUID          NOT NULL REFERENCES generated_documents(id) ON DELETE CASCADE,
    section_id   VARCHAR(255)  NOT NULL,
    content      JSONB,
    edited_by    UUID          REFERENCES users(id) ON DELETE SET NULL,
    metadata     JSONB,
    created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX        IF NOT EXISTS ix_generated_document_section_overrides_tenant_id     ON generated_document_section_overrides(tenant_id);
CREATE INDEX        IF NOT EXISTS ix_generated_document_section_overrides_document_id   ON generated_document_section_overrides(document_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_generated_document_section_overrides_doc_section   ON generated_document_section_overrides(document_id, section_id);

-- =============================================================================
-- Domain 9 — HC platform exports (named to avoid colliding with existing
-- `exports` table from app.models.export.Export)
-- =============================================================================

CREATE TABLE IF NOT EXISTS hc_platform_exports (
    id                     UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id              UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    project_id             UUID          REFERENCES projects(id) ON DELETE SET NULL,
    generated_document_id  UUID          REFERENCES generated_documents(id) ON DELETE SET NULL,
    export_type            VARCHAR(100),
    format                 VARCHAR(50)   NOT NULL DEFAULT 'pdf',
    status                 VARCHAR(50)   NOT NULL DEFAULT 'pending',
    storage_path           TEXT,
    expires_at             TIMESTAMPTZ,
    error_message          TEXT,
    metadata               JSONB,
    started_at             TIMESTAMPTZ,
    completed_at           TIMESTAMPTZ,
    created_at             TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_hc_platform_exports_tenant_id ON hc_platform_exports(tenant_id);
