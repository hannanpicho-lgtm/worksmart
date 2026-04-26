# WorkSmart (static site)

**Deploy root:** the `public/` folder (HTML, CSS, assets). Configure Cloudflare **Pages** with build output directory **`public`**.

| Doc                                          | What                                                                             |
| -------------------------------------------- | -------------------------------------------------------------------------------- |
| [DEPLOY.md](DEPLOY.md)                       | Cloudflare setup, custom domain, Git, CI, analytics, optional form-ingest Worker |
| [CONTRIBUTING.md](CONTRIBUTING.md)           | Branching, commit, and PR workflow                                               |
| [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md) | Safe merge/deploy checklist                                                      |

**Local preview:** from `public/`, run `npx -y serve` or `python -m http.server` and open `/index.html`.

## Local workflow

- Install dependencies: `npm install`
- Run local preview: `npm run dev`
- Format files: `npm run format`
- Check formatting (CI-safe): `npm run format:check`
- Check production placeholders: `npm run content:check`
- Guided ship command: `npm run ship`
- Quick non-interactive ship: `npm run ship:quick`

## Local release copilot

Use `npm run ship` to automate local checks + push flow without GitHub Actions:

- Blocks shipping from `main`/`master` by default
- Runs `npm run format:check`
- Stages all changed files and prompts for commit message
- Pushes current branch with upstream
- Prints a ready-to-open GitHub compare URL

Useful flags:

- `npm run ship:open` opens the compare URL in your browser
- `node scripts/ship.mjs --no-check` skips formatting check (only when needed)
- `node scripts/ship.mjs --allow-main` allows shipping from `main` (not recommended)

## Deterministic local pipeline (GitHub Actions replacement)

### Why this exists (the “two layers” you wanted)

GitHub’s hosted CI/CD is effectively **two cooperating layers**:

1. **Layer 1 — checks before the change is “real” on the remote**  
   Lint/format/tests/build run in a controlled environment so broken work does not land as the default story of the repo.

2. **Layer 2 — automation after the change is pushed**  
   Open/update a PR, optionally merge, trigger deployment, and **verify the live system** so “green” means something customer-visible.

This repo’s **`npm run pipeline`** is designed to reproduce that **same two-layer contract** end to end (local gates, then merge and production deploy/verify—see **DEPLOY.md** for Cloudflare Git vs GitHub Actions):

| Layer | What runs here                                                                                                 | What you should type per iteration (when configured)               |
| ----- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| **1** | Deterministic quality gates on your machine (`format:check`, `content:check`, optional npm scripts if present) | **`npm run pipeline`** (one command drives the rest)               |
| **2** | GitHub API (create/update PR; optional merge) + Cloudflare (deploy trigger) + production verification          | Same command; merge in GitHub only if you are not using auto-merge |

**Design goal:** reduce repeated human ceremony. **One-time** setup is unavoidable (tokens, Pages hooks, `wrangler login` once per machine). **Per change**, the pipeline is the spine: either it finishes green, or it stops with a **single** actionable error.

**What belongs in the pipeline:** anything you were doing “every PR” manually (checks, commit discipline, push, PR link, deploy trigger, smoke verification). **Optional Worker** deploy for `workers/form-analytics/` is included the same way: if that path is in the change set, the pipeline runs `wrangler deploy` after push (same Cloudflare token), so you are not maintaining a second ritual for routine edits.

### What the pipeline does (stages)

- Validates branch safety rules and changed files
- Runs quality gates (`format:check`, `content:check`, plus optional scripts from `pipeline.config.json`)
- Commits and pushes
- **If `workers/form-analytics/` changed:** deploys the form-ingest Worker via Wrangler (skips automatically when that folder is untouched)
- Creates/updates a PR via GitHub API
- After merge to **`main`**, production deploy is expected from **Cloudflare Git** (if connected) and/or the **Deploy Cloudflare Pages** workflow (runs on every push to `main` when secrets are set)
- Keeps production verification available via `npm run verify:prod`
- Writes a machine-readable run log under `logs/`

State flow (conceptual):

`PENDING → VALIDATING → PRECHECK → COMMITTING → PUSHING → (worker-deploy when needed) → PR_CREATING → DEPLOYING → VERIFYING → SUCCESS/FAILED`

### Commands

- `npm run pipeline` — default fully automated pipeline (auto-merge enabled in config)
- `npm run pipeline:full` — fully automated path (includes `--auto-merge`)
- `npm run pipeline:dry` — dry run (no commit/push/deploy/Worker deploy)
- `npm run pipeline:release` — release mode (`--release --auto-merge`)
- `npm run deploy:prod` — optional direct trigger path for production deploy + marker verification
- `npm run deploy:preview` — optional direct trigger path for preview deploy
- `npm run verify:prod` — verify live production markers only

Flags (fatigue reducers / escape hatches):

- `--skip-deploy` — skip Cloudflare **Pages** deploy + verify stages only
- `--skip-worker-deploy` — skip the optional **Worker** deploy stage even when `workers/form-analytics/` changed

### Git-first deploy mode (recommended on blocked networks)

If your network gets challenged by Cloudflare API/hook endpoints, use this repo default:

- `deploy.enabled: false` in `pipeline.config.json`
- Let Cloudflare Pages auto-build from merged `main` commits
- Run `npm run verify:prod` after merge as your deterministic post-deploy check

### Environment variables (see `.env.pipeline.example`)

- `GITHUB_TOKEN` — PR create/update (and merge when enabled)
- `CLOUDFLARE_API_TOKEN` — Pages API or hooks; also used when the pipeline deploys the form analytics Worker
- `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_PROJECT_NAME` — Pages deploy stages
- `CLOUDFLARE_DEPLOY_HOOK_URL_PREVIEW` / `CLOUDFLARE_DEPLOY_HOOK_URL_PRODUCTION` — when `deploy.mode` is `hook`

### Safety / fail-fast

- Non-release runs are blocked on `main`/`master`
- Any stage failure hard-stops the pipeline with a fix hint
- Missing tokens fail early with setup guidance
- If Pages API deploy is incompatible with your project (manifest/Git-connected), the error points you at deploy hooks
- Verification fails if production markers are missing

### Deploy mode (`pipeline.config.json` → `deploy.mode`)

- `auto` — recommended default: if deploy hook env var exists, use `hook`; otherwise use `api`
- If `api` fails with a Git-connected manifest error and a deploy hook exists, pipeline falls back to `hook` automatically
- If hook triggering is blocked (for example 403 challenge), pipeline/deploy command falls back to `api` automatically in `auto` mode
- `hook` — uses `CLOUDFLARE_DEPLOY_HOOK_URL_*`
- `api` — uses the Pages deployment API (may fail on some Git-connected projects; hooks are the fallback)

### Deploy environment selection (`pipeline.config.json` → `deploy.environments`)

- `["auto"]` — recommended default:
  - non-release runs -> `preview`
  - release/auto-merge runs -> `production`
- You can still set explicit values like `["preview"]` or `["production"]` if needed

### Worker auto-deploy (`pipeline.config.json` → `workers.formAnalytics`)

- Set `enabled` to `false` if you deploy that Worker elsewhere
- When `enabled` is `true` and changed files match `pathPrefix`, the pipeline runs `npx wrangler deploy` after push

## Production content audit

Run `npm run content:check` before release-oriented PRs. It fails if known placeholder values are still present in:

- `public/index.html` (domain metadata and placeholder contact details)
- `public/robots.txt` (sitemap URL)
- `public/sitemap.xml` (site URL)

When you add a custom domain, replace `https://worksmart.pages.dev` in `public/index.html`, `robots.txt`, and `sitemap.xml` (search the repo).
