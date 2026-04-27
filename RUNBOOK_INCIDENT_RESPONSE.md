# Runbook: Incident Response (Deploy / Monitor Alerts)

Use this when Slack reports a failure from:

- **Deploy Cloudflare Pages**
- **Monitor Production**

## Severity guide

- **SEV-1**: Site unavailable or critical user flow broken (contact form unusable, 5xx on home).
- **SEV-2**: Deploy/monitor failing but site still usable (non-critical regression, telemetry-only issue).
- **SEV-3**: Intermittent or non-user-facing issue (flaky check, transient network/DNS).

## First 10 minutes checklist

1. Open alert link (GitHub Actions run URL).
2. Confirm failing workflow/job/step.
3. Run local snapshot:
   - `npm run ops:status`
4. If needed, generate triage note:
   - `npm run ops:incident-template`
5. Classify severity and assign owner.

## Triage paths

### A) Deploy workflow failure

1. Check failing step in **Deploy Cloudflare Pages** run:
   - Publish step (Cloudflare token/account/project issues)
   - `verify-prod` step (markers/production URL)
   - `verify:telemetry` step (origin/CORS/auth)
2. Validate secrets/variables in GitHub:
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`
   - `FORM_ANALYTICS_WORKER_URL` (if telemetry check enabled)
3. Re-run workflow on `main` after fix.

### B) Monitor workflow failure

1. Check if Pages/Worker are actually down:
   - `npm run verify:prod`
   - `npm run verify:telemetry`
2. If only monitor failed and live checks pass:
   - treat as transient; inspect recent network/DNS/API errors
   - keep cooldown-based Slack dedupe in mind
3. If live checks fail:
   - escalate to SEV-1/2 and move to rollback path below.

## Common signatures and fixes

- **No deployment after merge**
  - Follow `RUNBOOK_DEPLOY_STUCK.md`
- **`verify:telemetry` -> 403**
  - Worker `ALLOWED_ORIGINS` must include exact origin (no trailing slash), e.g. `https://worksmart-188.pages.dev`
- **Workflow invalid / jobs not starting**
  - Workflow syntax/logic error; `Quality Checks / workflow-lint` should catch this pre-merge

## Rollback fast path

1. Revert bad merge commit on `main` (new revert commit).
2. Push revert commit.
3. Confirm **Deploy Cloudflare Pages** runs and succeeds.
4. Re-run:
   - `npm run verify:prod`
   - `npm run verify:telemetry`

## Incident closure template

- **What happened:** [1-2 lines]
- **Impact window:** [start/end UTC]
- **Root cause:** [specific]
- **Fix applied:** [specific]
- **Verification evidence:** [run URLs / command output]
- **Prevention action:** [workflow/test/doc update]
