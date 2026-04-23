# Deploy WorkSmart to Cloudflare Pages

## Workers vs Pages (important)

| Product | Use for | Typical URL |
|--------|---------|-------------|
| **Cloudflare Workers** | Serverless **code** (JavaScript) | `*.workers.dev` |
| **Cloudflare Pages** | **Static sites** (HTML, CSS, assets) | `*.pages.dev` |

This site is **static files only**. It must live on **Pages**, not Workers.

The GitHub Action in this repo deploys to **Pages** only (`cloudflare/pages-action`).

---

## What gets published

Everything in **`public/`** is the website root:

| File | Purpose |
|------|---------|
| `index.html` | Main page |
| `styles.css` | Styles |
| `favicon.svg` | Browser tab icon |
| `og-image.svg` | Open Graph / social preview (1200×630) |
| `robots.txt` | Crawler rules |
| `sitemap.xml` | Search engines (single URL for now) |
| `_headers` | Security headers (Cloudflare Pages) |

**Cloudflare:** build output directory = **`public`**.

**Repository / project name:** `worksmart` — use the same **Pages** project name, or change `projectName` in `.github/workflows/cloudflare-pages.yml`.

---

## 1. Git → Cloudflare Pages (recommended)

1. `git init` in this folder (if needed), commit, push to GitHub.
2. Cloudflare → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
3. Build settings:

   | Setting | Value |
   |--------|--------|
   | Framework preset | **None** |
   | Build command | *(empty)* |
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

## 3. GitHub Actions (optional CI)

1. Cloudflare **Account ID** + **API token** (Pages: **Edit**).
2. GitHub repo → **Settings** → **Secrets and variables** → **Actions**:

   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`

3. Pushes to **`main`** run `.github/workflows/cloudflare-pages.yml` and deploy **`public/`**.

---

## 4. Web Analytics

- **Easiest:** Cloudflare dashboard → **Analytics** → **Web Analytics** → add your site / domain and follow the wizard (often no code change on Pages).
- **Token-based:** uncomment the beacon script in `public/index.html` and paste the token from Cloudflare.

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
