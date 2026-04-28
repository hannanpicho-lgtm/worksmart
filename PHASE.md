# WorkSmart Delivery Phases

This file tracks implementation phases so the project can continue smoothly across sessions.

## Phase 1 — Deployment Restoration (Completed)

- Re-enabled automatic Pages deploys on merge to `main`.
- Restored pipeline deploy behavior and production verification.
- Fixed workflow validation issue that blocked deploy runs.

## Phase 2 — Telemetry and Observability (Completed)

- Added Worker `/metrics-summary` endpoint and tests.
- Added CLI tools:
  - `npm run metrics:summary`
  - `npm run verify:telemetry`
  - `npm run doctor:env`
- Added post-deploy telemetry checks and scheduled monitor workflow.
- Added optional Slack alerts and cooldown-based dedupe.

## Phase 3 — CI Guardrails (Completed)

Goal: prevent accidental CI/workflow regressions before merge.

Completed in this phase:

- Added GitHub workflow linting (`actionlint`) in `Quality Checks`.
- Added branch-protection required-check runbook (`RUNBOOK_BRANCH_PROTECTION.md`).
- Added deploy-stuck + rollback runbook (`RUNBOOK_DEPLOY_STUCK.md`).

## Phase 4 — Stability and Operations (Completed)

Goal: improve day-2 operations visibility and response speed.

Completed in this phase:

- Added `npm run ops:status` snapshot command (live Pages/Worker health + latest workflow statuses).
- Added JSON mode (`npm run ops:status -- --json`) and incident template generator (`npm run ops:incident-template`).
- Added a short incident response runbook for monitor/deploy Slack alerts (`RUNBOOK_INCIDENT_RESPONSE.md`).
- Added lightweight workflow status badges to the README.

## Phase 5 — Dependency hygiene (Completed)

Goal: keep npm packages and GitHub Actions up to date with reviewable, automated pull requests.

Completed in this phase:

- Added Dependabot version updates for `npm` and `github-actions` (see `.github/dependabot.yml`).

Next optional items:

1. Triage the first few Dependabot PRs: merge if Quality Checks are green, or pin versions if an upgrade breaks the pipeline.
2. If you add a custom domain, extend `verify-prod` / `ALLOWED_ORIGINS` and document the exact origin in **DEPLOY.md** (one line in the environment section is enough).

## Phase 6 — Merge Resilience (Completed)

Goal: prevent late pipeline failures by catching branch drift from `main` before PR merge automation.

Completed in this phase:

- Added `npm run branch:check` to verify branch sync against `origin/main`.
- Integrated branch sync validation into `npm run readiness:report` as a required check.
- Added pipeline `--sync` mode (`npm run pipeline:sync`) to auto-sync latest base branch before PR automation.
- Unified `branch:check` + pipeline sync target resolution to shared `sync.remote` / `sync.baseBranch` config.
- Fixed deploy wait behavior for Git-connected Pages projects so post-merge production success is detected reliably.

## Phase 7 — Operational Steady State (Completed)

Goal: lock the project into a low-friction, repeatable release path.

Completed in this phase:

- Restored green `Quality Checks` by fixing workflow lint execution and CI test invocation portability.
- Standardized day-to-day release flow around `npm run readiness:report` -> `npm run pipeline:sync`.
- Added explicit token hygiene guidance (rotation + revoke-on-exposure) to deployment docs.

## Phase 8 — Continuous Stability Watch (Completed)

Goal: catch dependency or runtime drift early, even during inactive periods.

Completed in this phase:

- Added scheduled `Nightly Stability` GitHub Actions workflow (`.github/workflows/nightly-stability.yml`).
- Runs deterministic checks each night (`npm run ci:local`) on `main`.
- Supports manual `workflow_dispatch` so operators can run the same stability suite on demand.

## Phase 9 — CI Command Unification (Completed)

Goal: reduce drift between local preflight checks and GitHub workflow behavior.

Completed in this phase:

- Added `npm run ci:local` as the single canonical local CI gate command.
- Updated `Quality Checks` workflow to execute `npm run ci:local` after dependency install.
- Updated `Nightly Stability` workflow to execute the same `npm run ci:local` command.

## Phase 10 — Post-Merge Green Watch (Completed)

Goal: remove manual polling after merges and make stabilization checks repeatable.

Completed in this phase:

- Added `npm run ops:watch` to poll `ops:status --json` until core post-merge checks are green.
- Wired `ops:watch` to gate on Pages health, Worker health, and workflow success (`Quality Checks`, `Deploy Cloudflare Pages`).
- Documented `ops:watch` in the command reference for operators.
