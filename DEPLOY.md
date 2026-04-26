# Deploy WorkSmart to Cloudflare Pages

## Workers vs Pages (important)

| Product                | Use for                              | Typical URL     |
| ---------------------- | ------------------------------------ | --------------- |
| **Cloudflare Workers** | Serverless **code** (JavaScript)     | `*.workers.dev` |
| **Cloudflare Pages**   | **Static sites** (HTML, CSS, assets) | `*.pages.dev`   |

This site is **static files only**. It must live on **Pages**, not Workers.

**Deploy path (choose one):**

- **Recommended (no GitHub Actions billing):** Cloudflare Pages **Connect to Git** — every push/merge to `main` builds from the repo. See §1.
- **Optional:** Manual run of the workflow **Deploy Cloudflare Pages** in GitHub Actions (uses `cloudflare/pages-action`). It is **manual-only** so a locked/billed-out GitHub account does not block merges.

---

## What gets published

Everything in **`public/`** is the website root:

| File           | Purpose                                |
| -------------- | -------------------------------------- |
| `index.html`   | Main page                              |
| `styles.css`   | Styles                                 |
| `favicon.svg`  | Browser tab icon                       |
| `og-image.svg` | Open Graph / social preview (1200×630) |
| `robots.txt`   | Crawler rules                          |
| `sitemap.xml`  | Search engines (single URL for now)    |
| `_headers`     | Security headers (Cloudflare Pages)    |

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
   - `public/index.html` — `canonical`, `og:url`, `og:image` (and add a real **1200×630** `og-image.png` later if you want rich previews on all networks).
   - `public/robots.txt` — `Sitemap:` line.
   - `public/sitemap.xml` — `<loc>`.

   Replace `https://worksmart.pages.dev` with your real URL (e.g. `https://www.yourdomain.com/`).

---

## 3. GitHub Actions (optional, manual only)

The workflow **Deploy Cloudflare Pages** does **not** run on every push. Open **Actions** → **Deploy Cloudflare Pages** → **Run workflow** when you want an API-based deploy from GitHub.

1. Cloudflare **Account ID** + **API token** (Pages: **Edit**).
2. GitHub repo → **Settings** → **Secrets and variables** → **Actions**:
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`

---

## 4. Web Analytics

- **Easiest:** Cloudflare dashboard → **Analytics** → **Web Analytics** → add your site / domain and follow the wizard (often no code change on Pages).
- **Token-based:** uncomment the beacon script in `public/index.html` and paste the token from Cloudflare.

### 4b. Contact form telemetry ingest (optional Worker)

The site can POST anonymized form funnel events to a **separate** Cloudflare Worker (`workers/form-analytics/`). This is **not** your Pages project.

**Preferred (same automation spine as the site):** when you change files under `workers/form-analytics/`, `npm run pipeline` deploys that Worker after push (uses `CLOUDFLARE_API_TOKEN`; one-time `npx wrangler login` on the machine). Disable with `workers.formAnalytics.enabled: false` in `pipeline.config.json` or run the pipeline with `--skip-worker-deploy`.

**Standalone** (if you only need to redeploy the Worker):

```bash
npm run worker:form-analytics:deploy
```

Wire the site in `public/index.html` on the contact form:

- `data-analytics-endpoint="https://<worker-subdomain>.workers.dev"` (the script appends `/ingest` when the path is `/`)

After deploy, open the printed `*.workers.dev` URL with `/health` (for example `https://worksmart-form-analytics.<account>.workers.dev/health`) and confirm `{"ok":true,...}`.

**Lock down browser traffic (recommended):** in the Worker → **Settings** → **Variables**, add `ALLOWED_ORIGINS` with a comma-separated list of exact origins that may call the ingest API (for example `https://worksmart-188.pages.dev,https://www.yourdomain.com`). If this variable is missing, the Worker allows any origin (`*`) for the ingest route (fine for local testing, weak for production).

**Optional KV counters:** create a KV namespace, bind it as `METRICS` in `workers/form-analytics/wrangler.toml` (see comments in that file), redeploy, then use `GET /metrics?token=<ANALYTICS_INGEST_SECRET>` (today only) or `GET /metrics-summary?token=<ANALYTICS_INGEST_SECRET>&days=7` (rollup + success/blocked rates) only if you also set the `ANALYTICS_INGEST_SECRET` secret on the Worker. **Note:** the static site cannot safely send a Bearer token from `sendBeacon`; if you set `ANALYTICS_INGEST_SECRET`, browser beacons will fail ingest auth—prefer `ALLOWED_ORIGINS` (and optionally Cloudflare Access) for browser-sourced telemetry.

---

## 5. Content

- Edit **email, office, hours** in `public/index.html` (see comment above the contact grid).
- Add a proper **OG image** (`og-image.png`) and point `og:image` to it for best social previews.

---

## 6. Manual upload (zip)

If you zip instead of Git, the **zip root** must contain **all** `public/` assets, e.g.:

```text
index.html
styles.css
favicon.svg
og-image.svg
robots.txt
sitemap.xml
_headers
```

---

## Troubleshooting

- **Raw CSS in browser:** you opened `/styles.css` or the deploy root omitted `index.html` — use output directory **`public`** or fix the zip layout.
- **Worker vs Pages:** static site must be a **Pages** project (`.pages.dev`), not a Worker (`.workers.dev`).
