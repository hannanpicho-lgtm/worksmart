# Runbook: Branch Protection for `main`

Set this once to enforce the CI contract before merges.

## Objective

Require the core checks to pass before anything lands on `main`.

## Recommended settings

GitHub repo -> **Settings** -> **Branches** -> **Add rule** (or edit existing) for `main`.

Enable:

- **Require a pull request before merging**
- **Require status checks to pass before merging**
- **Require branches to be up to date before merging**
- **Require conversation resolution before merging** (recommended)
- **Do not allow bypassing** (if your team wants strict enforcement)

## Required status checks

Select these checks as required:

- `Quality Checks / format-check`
- `Quality Checks / workflow-lint`
- `Deploy Cloudflare Pages / deploy`
- `Monitor Production / verify` (optional as required; recommended for stricter production discipline)

Notes:

- Check names are workflow/job scoped as shown in Actions UI.
- If a check name changes (workflow/job rename), reselect the new name in branch protection.

## Why these checks

- **Quality Checks**: catches formatting/content/test/workflow syntax regressions.
- **Deploy Cloudflare Pages**: proves merge-to-main still produces deployable production artifacts.
- **Monitor Production**: proves verification logic works on schedule and can surface runtime regressions.

## Fast verification after setup

1. Open a small PR to `main`.
2. Confirm required checks appear in PR merge box.
3. Confirm merge button is disabled until all required checks pass.

## Common pitfalls

- Required check appears as "Expected — Waiting for status to be reported":
  - Workflow file renamed or disabled.
  - Job name changed.
  - Trigger no longer runs for PR/main.

- Deploy check missing:
  - Verify `.github/workflows/cloudflare-pages.yml` still triggers on `push` to `main`.

- Monitor check noisy:
  - Keep `SLACK_ALERT_COOLDOWN_MINUTES` configured to avoid alert spam during outages.
