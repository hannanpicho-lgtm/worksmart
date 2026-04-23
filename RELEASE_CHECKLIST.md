# Release Checklist

Use this before merging meaningful production changes to `main`.

## Pre-merge

- [ ] Pull request is focused and reviewable.
- [ ] `Quality Checks / format-check` is passing.
- [ ] Docs updated (`README.md` / `DEPLOY.md`) if behavior changed.
- [ ] No secrets or local-only files are included.

## Pre-deploy

- [ ] Cloudflare Pages project settings are unchanged and correct.
- [ ] `public/` contains current production assets.
- [ ] Canonical URL, `robots.txt`, and `sitemap.xml` use the correct domain.

## Post-merge verification

- [ ] Site deploy completes successfully in GitHub Actions / Cloudflare.
- [ ] Homepage loads without broken assets.
- [ ] Metadata checks:
  - [ ] title/description
  - [ ] Open Graph tags
  - [ ] JSON-LD
- [ ] Basic manual smoke test:
  - [ ] navigation links work
  - [ ] contact details render correctly

## Cleanup

- [ ] Delete merged branch (local and remote).
- [ ] Create follow-up issues for deferred improvements.
