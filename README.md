# WorkSmart (static site)

**Deploy root:** the `public/` folder (HTML, CSS, assets). Configure Cloudflare **Pages** with build output directory **`public`**.

| Doc                                          | What                                                |
| -------------------------------------------- | --------------------------------------------------- |
| [DEPLOY.md](DEPLOY.md)                       | Cloudflare setup, custom domain, Git, CI, analytics |
| [CONTRIBUTING.md](CONTRIBUTING.md)           | Branching, commit, and PR workflow                  |
| [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md) | Safe merge/deploy checklist                         |

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

Use `npm run pipeline` for a strict fail-fast local CI/CD run:

- Validates branch safety rules and changed files
- Executes quality gates (`format:check`, `content:check`)
- Commits and pushes deterministically
- Creates/updates PR via GitHub API
- Triggers and polls Cloudflare production deployment
- Verifies live production markers before success
- Writes a machine-readable run log under `logs/`
- Tracks explicit states:
  `PENDING -> VALIDATING -> PRECHECK -> COMMITTING -> PUSHING -> PR_CREATING -> DEPLOYING -> VERIFYING -> SUCCESS/FAILED`

Commands:

- `npm run pipeline` - normal pipeline
- `npm run pipeline:dry` - dry run (no commit/push/deploy)
- `npm run pipeline:release` - release mode (`--release --auto-merge`)

Required environment variables (see `.env.pipeline.example`):

- `GITHUB_TOKEN`
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_PROJECT_NAME`
- `CLOUDFLARE_DEPLOY_HOOK_URL_PREVIEW` (recommended for feature-branch preview deploys)
- `CLOUDFLARE_DEPLOY_HOOK_URL_PRODUCTION` (recommended for release/merged production deploys)

Safety/fallback behaviors:

- Non-release runs are blocked on `main`/`master`
- Any stage failure hard-stops the pipeline
- If API tokens are missing, pipeline fails with explicit setup guidance
- If Cloudflare API deploy trigger requires a manifest (Git-connected Pages), pipeline instructs deploy-hook setup
- Deploy verification fails if expected production markers are absent

## Production content audit

Run `npm run content:check` before release-oriented PRs. It fails if known placeholder values are still present in:

- `public/index.html` (domain metadata and placeholder contact details)
- `public/robots.txt` (sitemap URL)
- `public/sitemap.xml` (site URL)

When you add a custom domain, replace `https://worksmart.pages.dev` in `public/index.html`, `robots.txt`, and `sitemap.xml` (search the repo).
