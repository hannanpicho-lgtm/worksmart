# Deploy WorkSmart to Cloudflare Pages

## Workers vs Pages (important)

| Product                | Use for                              | Typical URL     |
| ---------------------- | ------------------------------------ | --------------- |
| **Cloudflare Workers** | Serverless **code** (JavaScript)     | `*.workers.dev` |
| **Cloudflare Pages**   | **Static sites** (HTML, CSS, assets) | `*.pages.dev`   |

This site is **static files only**. It must live on **Pages**, not Workers.

**Deploy path (choose one or use both):**

- **Cloudflare Pages → Connect to Git:** every push/merge to `main` builds from the repo in Cloudflare. See §1.
- **GitHub Actions:** the **Deploy Cloudflare Pages** workflow runs on **every push to `main`** and publishes `public/` via `cloudflare/pages-action` (needs repo secrets in §3). Use this if Pages is not Git-connected or you want deploys driven from GitHub.

If **both** Git-connected Pages and this workflow are active on the same repo/branch, Cloudflare may run two production builds per push—pick one primary path or disconnect the other.

---

## What gets published

Everything in **`public/`** is the website root:

| File                 | Purpose                                                           |
| -------------------- | ----------------------------------------------------------------- |
| `index.html`         | Main page                                                         |
| `styles.css`         | Styles                                                            |
| `worksmart-logo.png` | Brand logo (nav, favicon, JSON-LD; source asset for OG art)       |
| `favicon.svg`        | Optional legacy icon (not used when PNG favicon is set)           |
| `og-image.png`       | Open Graph / social preview (1200×630; linked from `index.html`)  |
| `og-image.svg`       | Optional alternate art (not used in meta if PNG is set)           |
| `robots.txt`         | Crawler rules                                                     |
| `sitemap.xml`        | Search engines (single URL for now)                               |
| `_headers`           | Security + cache hints for logo, OG image, CSS (Cloudflare Pages) |

**Cloudflare:** build output directory = **`public`**.

**Repository / project name:** `worksmart` — use the same **Pages** project name, or change `projectName` in `.github/workflows/cloudflare-pages.yml`.

---

## 1. Git → Cloudflare Pages (recommended)

1. `git init` in this folder (if needed), commit, push to GitHub.
2. Cloudflare → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
3. Build settings:

   | Setting                | Value        |
   | ---------------------- | ------------ |
   | Framework preset       | **None**     |
   | Build command          | _(empty)_    |
   | Build output directory | **`public`** |

4. Deploy. Open `https://<project>.pages.dev/`.

---

## 2. Custom domain

1. Cloudflare → your **Pages** project → **Custom domains** → **Set up a domain**.
2. Add `www` and/or apex; follow DNS prompts (easiest if DNS is already on Cloudflare).
3. **Update site URLs** everywhere you still have the default Pages hostname:
   - `public/index.html` — `canonical`, `og:url`, `og:image` (uses **`og-image.png`**; update when the domain changes).
   - `public/robots.txt` — `Sitemap:` line.
   - `public/sitemap.xml` — `<loc>`.

   Replace `https://worksmart.pages.dev` with your real URL (e.g. `https://www.yourdomain.com/`).

---

## 3. GitHub Actions (Pages on every merge to `main`)

The workflow **Deploy Cloudflare Pages** runs automatically on **every push to `main`** (including merges), publishing the **`public/`** directory to the Cloudflare Pages project **`worksmart`**.

1. Cloudflare **Account ID** + **API token** (Pages: **Edit**).
2. GitHub repo → **Settings** → **Secrets and variables** → **Actions**:
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`

You can also open **Actions** → **Deploy Cloudflare Pages** → **Run workflow** to redeploy the current `main` without a new commit.

After publish, that workflow runs **`scripts/verify-prod.mjs`**: it loads **`deploy.productionUrl`** from `pipeline.config.json`, retries the fetch (see **`deploy.verifyFetchAttempts`** / **`deploy.verifyRetryDelayMs`**), and checks **`deploy.verifyContains`**. To also verify the form-analytics Worker, set **`workers.formAnalytics.verifyHealthUrl`** to your Worker’s `/health` URL (e.g. `https://worksmart-form-analytics.<account>.workers.dev/health`); leave the key unset to skip.

When **`FORM_ANALYTICS_WORKER_URL`** is set in Actions variables, the same workflow also runs **`npm run verify:telemetry`** after publish and fails fast if live `/ingest` rejects your production origin. The workflow uses concurrency + timeout guards so stale deploy runs are cancelled and hung jobs terminate automatically. If GitHub secret `SLACK_WEBHOOK_URL` is present, failed deploy runs also post a Slack alert with the run URL (deduped by cooldown; default 30 minutes, configurable via Actions variable `SLACK_ALERT_COOLDOWN_MINUTES`).

The workflow **Monitor Production** also runs every 30 minutes (and on manual dispatch) to execute `verify-prod` plus `verify:telemetry` (when `FORM_ANALYTICS_WORKER_URL` is set), so regressions are caught even without new commits. It has a timeout guard to prevent long-running monitor jobs.

---

## 4. Web Analytics

- **Easiest:** Cloudflare dashboard → **Analytics** → **Web Analytics** → add your site / domain and follow the wizard (often no code change on Pages).
- **Token-based:** uncomment the beacon script in `public/index.html` and paste the token from Cloudflare.

### 4b. Contact form telemetry ingest (optional Worker)

The site can POST anonymized form funnel events to a **separate** Cloudflare Worker (`workers/form-analytics/`). This is **not** your Pages project.

**On GitHub (recommended with merge-to-`main`):** the workflow **Deploy form-analytics Worker** runs automatically when commits under `workers/form-analytics/` land on `main` (same `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets as Pages). You can also run it from **Actions** → **Run workflow**. If **`FORM_ANALYTICS_WORKER_URL`** is set (same variable as Pages inject), the workflow then requests **`GET /health`** and fails the job if the response is not `{ "ok": true }`.

**From your machine:** when you change `workers/form-analytics/`, `npm run pipeline` can deploy that Worker after push (uses `CLOUDFLARE_API_TOKEN`; one-time `npx wrangler login`). Disable with `workers.formAnalytics.enabled: false` in `pipeline.config.json` or run the pipeline with `--skip-worker-deploy`.

**Standalone** (redeploy without a Worker code change):

```bash
npm run worker:form-analytics:deploy
```

Wire the site on the contact form (`data-analytics-endpoint`):

- **GitHub Actions (recommended):** repo → **Settings** → **Secrets and variables** → **Actions** → **Variables** → add **`FORM_ANALYTICS_WORKER_URL`** with your Worker’s **HTTPS origin** (no `/ingest` suffix), e.g. `https://worksmart-form-analytics.<account>.workers.dev`. The **Deploy Cloudflare Pages** workflow runs `scripts/inject-analytics-endpoint.mjs` before upload so production HTML gets the URL without committing it. Leave the variable unset to keep telemetry off in deployed builds.
- **Or edit `public/index.html` locally:** `data-analytics-endpoint="https://<worker-subdomain>.workers.dev"` (the client appends `/ingest` when the path is `/`).

After deploy, open the printed `*.workers.dev` URL with `/health` (for example `https://worksmart-form-analytics.<account>.workers.dev/health`) and confirm `{"ok":true,...}`.

Run `npm run verify:telemetry` to post a synthetic `submit_attempt` to live `/ingest` using your production origin header. If it returns 403, your `ALLOWED_ORIGINS` value likely does not exactly match the live site origin.

**Lock down browser traffic (recommended):** in the Worker → **Settings** → **Variables**, add `ALLOWED_ORIGINS` with a comma-separated list of exact origins that may call the ingest API (for example `https://worksmart-188.pages.dev,https://www.yourdomain.com`). If this variable is missing, the Worker allows any origin (`*`) for the ingest route (fine for local testing, weak for production).

**Optional KV counters:** create a KV namespace, bind it as `METRICS` in `workers/form-analytics/wrangler.toml` (see comments in that file), redeploy, then use `GET /metrics?token=<ANALYTICS_INGEST_SECRET>` (today only) or `GET /metrics-summary?token=<ANALYTICS_INGEST_SECRET>&days=7` (rollup + success/blocked rates) only if you also set the `ANALYTICS_INGEST_SECRET` secret on the Worker. **Note:** the static site cannot safely send a Bearer token from `sendBeacon`; if you set `ANALYTICS_INGEST_SECRET`, browser beacons will fail ingest auth—prefer `ALLOWED_ORIGINS` (and optionally Cloudflare Access) for browser-sourced telemetry.

For operator reads in terminal, run `npm run metrics:summary -- --days=7` (uses `FORM_ANALYTICS_WORKER_URL` and `ANALYTICS_INGEST_SECRET` from env; add `--json` for raw response).

---

## 5. Content

- Edit **email, office, hours** in `public/index.html` (see comment above the contact grid).
- **`og:image`** in `index.html` should point at **`og-image.png`** (1200×630) for broad social network support; replace `public/og-image.png` when you refresh branding, then run **`npm run optimize:og`** to resize (if needed) and compress the PNG.

---

## 6. Manual upload (zip)

If you zip instead of Git, the **zip root** must contain **all** `public/` assets, e.g.:

```text
index.html
styles.css
worksmart-logo.png
favicon.svg
og-image.png
og-image.svg
robots.txt
sitemap.xml
_headers
```

---

## Troubleshooting

- **Raw CSS in browser:** you opened `/styles.css` or the deploy root omitted `index.html` — use output directory **`public`** or fix the zip layout.
- **Worker vs Pages:** static site must be a **Pages** project (`.pages.dev`), not a Worker (`.workers.dev`).
