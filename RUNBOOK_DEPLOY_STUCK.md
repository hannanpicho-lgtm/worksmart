# Runbook: Deploy Stuck / No New Pages Timestamp

Use this when you merged to `main` but Cloudflare Pages does not show a fresh deployment.

## 1) Confirm merge actually landed on `main`

- GitHub repo -> **Commits** on `main`
- Confirm your merge commit exists and time is recent

If not present, the issue is merge/branch, not deployment.

## 2) Check Deploy workflow run status

- GitHub -> **Actions** -> **Deploy Cloudflare Pages**
- Open latest run on `main`

Expected: run exists for the merge commit and has `completed / success`.

If there is **no run**:
- Check workflow trigger in `.github/workflows/cloudflare-pages.yml` (`on.push.branches: [main]`)
- Check repo Actions settings are enabled
- Check workflow file exists on `main`

If run exists but **fails before jobs start**:
- Likely workflow validation/syntax issue
- Open run summary for "workflow is not valid" type errors
- Fix workflow YAML and merge to `main` (Quality Checks includes `actionlint`)

## 3) Check Cloudflare credentials in GitHub

Repo -> **Settings** -> **Secrets and variables** -> **Actions**

Required secrets:
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

Common failure: token rotated locally but secret not updated in GitHub.

## 4) Re-run deploy manually

If workflow file is fixed and secrets are valid:
- Actions -> **Deploy Cloudflare Pages** -> **Run workflow** on `main`

Then verify Cloudflare Pages timestamp updates.

## 5) Verify post-deploy checks

After deploy success:

- `npm run verify:prod`
- `npm run verify:telemetry` (if analytics endpoint is configured)

If telemetry fails with 403:
- Worker `ALLOWED_ORIGINS` must include exact origin, e.g. `https://worksmart-188.pages.dev` (no trailing slash).

## 6) Emergency fast-path rollback

If production is bad and you need a quick restore:

1. Revert the bad merge commit on `main` (new commit, no history rewrite).
2. Push revert commit to `main`.
3. Deploy workflow should auto-run and publish the reverted state.

## 7) If still stuck

Collect these for diagnosis:
- Failing workflow run URL
- First failing step name + error text
- Cloudflare project name shown in workflow config
- Whether secrets were recently changed
