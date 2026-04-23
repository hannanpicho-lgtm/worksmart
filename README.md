# WorkSmart (static site)

**Deploy root:** the `public/` folder (HTML, CSS, assets). Configure Cloudflare **Pages** with build output directory **`public`**.

| Doc | What |
|-----|------|
| [DEPLOY.md](DEPLOY.md) | Cloudflare setup, custom domain, Git, CI, analytics |

**Local preview:** from `public/`, run `npx -y serve` or `python -m http.server` and open `/index.html`.

When you add a custom domain, replace `https://worksmart.pages.dev` in `public/index.html`, `robots.txt`, and `sitemap.xml` (search the repo).
