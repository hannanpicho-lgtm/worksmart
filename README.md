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

When you add a custom domain, replace `https://worksmart.pages.dev` in `public/index.html`, `robots.txt`, and `sitemap.xml` (search the repo).
