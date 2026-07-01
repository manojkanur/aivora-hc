# HC Platform Seed Data

Reference data + a minimal sample tenant for the HC platform. The loader at
`app/scripts/seed_hc_platform.py` consumes every JSON file in this directory.

## Files

| File | Purpose | Natural key |
| --- | --- | --- |
| `modules.json` | 23-entry module catalogue. Drives the marketplace UI and entitlement checks. | `key` |
| `subscription_plans.json` | Starter / Professional / Enterprise plan tiers. | `key` |
| `entitlements.json` | plan -> module mappings with optional seat caps. The loader resolves `plan_key` -> plan id. | `(plan_id, module_key)` |
| `maturity_models.json` | One global 7-dimension HC maturity model + 5 score bands. | model `key`, band `(model_id, band_name)` |
| `benchmark_profiles.json` | 3 reference benchmark profiles (technology / financial-services / healthcare) with 7 dimension scores each. | profile `key`, score `(profile_id, dimension_key)` |
| `recommendation_library.json` | 30+ curated recommendations across 8 categories x 3 horizons. | `key` |
| `scenario_templates.json` | 5 scenario templates (growth, restructuring, automation, AI adoption, workforce reduction). | `scenario_type` |
| `mobility_move_types.json` | 7 move type codes (rotation, permanent_move, stretch, project, secondment, promotion, cross_functional). | `code` |
| `mobility_kpi_dictionary.json` | 12 mobility KPI definitions with formulas. | `key` |
| `ai_prompt_templates.json` | LLM prompt templates for the AI advisory engine. | `key` |
| `document_templates.json` | CV1 document templates exposed in the Document Workspace. | `id` |
| `document_template_versions.json` | Version rows linked to `document_templates.id`. | `(template_id, version)` |
| `sample_tenant.json` | A single demo tenant (`replit-sample.example`) with project, capability framework, role profiles, employees, opportunities, an HC review with intake + diagnostic data, and a scenario. | tenant `domain` |

## Running

```bash
cd backend
python -m app.scripts.seed_hc_platform
```

Idempotent — re-running produces the same state. Reference rows are upserted
via `INSERT ... ON CONFLICT DO NOTHING` on the natural key listed above; the
sample tenant is skipped if a tenant with the sample domain already exists.

## Environment variables

- `SEED_SAMPLE_TENANT` — `false` to skip the sample tenant (default `true`).
- Standard `DATABASE_URL` from `app.config.settings` is used.

## Sample tenant — what the loader does

After creating the tenant + child rows, the loader runs the engines so the
demo data has real computed outputs:

1. `maturity_engine.run(...)` against the global `hc_maturity_v1` model.
2. `benchmark_engine.run(...)` against the first benchmark profile whose
   `industry` matches the tenant industry.
3. `mobility_matcher.run_for_profile(...)` for every employee profile against
   every open opportunity.
4. `scenario_engine.run(...)` for the seeded scenario.

## Extending

- Add a new reference catalogue: drop a JSON file in this directory, then add
  a `seed_<name>(db)` helper in `app/scripts/seed_hc_platform.py` that
  upserts rows via `INSERT ... ON CONFLICT DO NOTHING` on the natural key.
- Keep records flat — the loader treats every JSON value as the column value;
  if a model has no column for a field, drop the field instead of adding it.
- All JSON must be strict — no trailing commas, no comments.
