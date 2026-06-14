# denlockhart.com

Source for [www.denlockhart.com](https://www.denlockhart.com/) — a static site that hosts **Dennis Lockhart's side projects**. Each project is a self-contained app under `projects/`, listed on the home page.

Deployed with [GitHub Pages](https://pages.github.com/) from this repository. Domain registered with [GoDaddy](https://www.godaddy.com/).

## Live URLs

| Page | URL |
|------|-----|
| Home | https://www.denlockhart.com/ |
| GitHub Pages default | https://denlockhart.github.io/ |
| Valour & Fortitude Army Builder | https://www.denlockhart.com/projects/army-builder/ |
| HIIT Timer 30/30 | https://www.denlockhart.com/projects/hiit-timer/ |
| Source | https://github.com/denlockhart/denlockhart.github.io |

## Purpose

This repository is **not** a single-app repo. It is the monorepo for Dennis Lockhart's personal web projects:

- **Site root** (`index.html`, `site.css`) — home page that links to each project
- **`projects/`** — one folder per project; each project owns its own code and assets
- **`CNAME`** — custom domain for GitHub Pages (`www.denlockhart.com`)
- **`.nojekyll`** — disables Jekyll so static files are served as-is
- **`netlify.toml`** — optional; only needed if you also deploy on Netlify

## Repository layout

```
denlockhart.github.io/
  index.html              # Home page — lists all projects
  site.css                # Home page styles
  CNAME                   # www.denlockhart.com (managed by GitHub Pages)
  .nojekyll               # Required for GitHub Pages
  projects/
    army-builder/         # Valour & Fortitude army list builder
    hiit-timer/           # 30/30 HIIT interval timer
      README.md
      index.html, app.js, style.css, data/...
```

## Projects

| Project | Folder | URL path |
|---------|--------|----------|
| Valour & Fortitude Army Builder | `projects/army-builder/` | `/projects/army-builder/` |
| HIIT Timer 30/30 | `projects/hiit-timer/` | `/projects/hiit-timer/` |

## Local development

No build step. Serve the repo root:

```bash
npx serve .
```

- Home: http://localhost:3000/
- Army Builder: http://localhost:3000/projects/army-builder/
- HIIT Timer: http://localhost:3000/projects/hiit-timer/

## Deploy with GitHub Pages

Deployment is automatic — push to `main` and GitHub Pages publishes the repo root.

1. **Repo name:** `denlockhart.github.io` (user site → served at `https://denlockhart.github.io/`)
2. **Settings → Pages:** source = `main` branch, folder = `/ (root)`
3. **Custom domain:** `www.denlockhart.com` (creates/updates the `CNAME` file)
4. **DNS (GoDaddy):** CNAME record — Name `www`, Value `denlockhart.github.io`
5. **Enforce HTTPS** in Pages settings once DNS is verified

```bash
git add .
git commit -m "Your change"
git push origin main
```

The site updates within a minute or two. No build pipeline required.

## Adding a new project

1. Create `projects/<slug>/` with the app's `index.html` and assets.
2. Add a project card to root `index.html` linking to `/projects/<slug>/`.
3. Add `projects/<slug>/README.md`.
4. Push to `main`.

## AI assistant docs

- [`AGENTS.md`](AGENTS.md) — repo-wide instructions for AI agents
- [`.cursor/rules/`](.cursor/rules/) — Cursor rules (site-wide and per-project)
