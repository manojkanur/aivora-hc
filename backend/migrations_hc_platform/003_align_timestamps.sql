-- =============================================================================
-- HC Platform port — Phase 3 alignment migration
-- =============================================================================
-- Ensures every UUIDBase-inherited table has created_at/updated_at columns so
-- the SQLAlchemy models (which always RETURN those after INSERT) line up.
-- Idempotent: safe to re-run.
-- =============================================================================

DO $$
DECLARE
    t text;
    tables text[] := ARRAY[
        'scenario_assumptions','scenario_outputs','scenario_risk_flags',
        'capability_ratings','framework_item_tags',
        'mobility_match_results','mobility_movement_events',
        'mobility_preferences','mobility_readiness_assessments',
        'mobility_eligibility_rules','mobility_barriers','mobility_rollups',
        'mobility_opportunity_requirements',
        'role_capability_requirements','role_adjacencies','role_mobility_facets',
        'career_path_stops','talent_visibility_signals',
        'maturity_dimension_results','benchmark_dimension_scores',
        'document_template_versions','generated_document_section_overrides',
        'module_document_bindings','review_documents','activity_log',
        'ai_generated_insights','hc_analysis_versions',
        'maturity_bands','benchmark_groups',
        'roadmap_outputs','roadmap_phases','roadmap_recommendations',
        'entitlements','tenant_modules'
    ];
BEGIN
    FOREACH t IN ARRAY tables LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t) THEN
            EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()', t);
            EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()', t);
        END IF;
    END LOOP;
END $$;
