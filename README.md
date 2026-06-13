# denlockhart.com

Source for [denlockhart.com](https://denlockhart.com/) — a static site that hosts **Dennis Lockhart's side projects**. Each project is a self-contained app under `projects/`, listed on the home page.

Hosted on [Netlify](https://www.netlify.com/) (also compatible with [GitHub Pages](https://pages.github.com/)). Domain registered with [GoDaddy](https://www.godaddy.com/).

## Live URLs

| Page | URL |
|------|-----|
| Home | https://denlockhart.github.io/ (also https://denlockhart.com/ when DNS points here) |
| Valour & Fortitude Army Builder | `/projects/army-builder/` on either host |
| Source | https://github.com/denlockhart/denlockhart.github.io |

## Purpose

This repository is **not** a single-app repo. It is the monorepo for Dennis Lockhart's personal web projects:

- **Site root** (`index.html`, `site.css`) — home page that links to each project
- **`projects/`** — one folder per project; each project owns its own code and assets
- **`netlify.toml`** — optional Netlify URL rewrites and cache headers
- **`.nojekyll`** — disables Jekyll on GitHub Pages so static files are served as-is

When you add a new project, you add a folder under `projects/`, link it from the home page, and add any Netlify redirects it needs.

## Repository layout

```
denlockhart.com/
  index.html              # Home page — lists all projects
  site.css                # Home page styles
  netlify.toml            # Optional Netlify rewrites + headers
  .nojekyll               # Required for GitHub Pages (skip Jekyll)
  AGENTS.md               # Instructions for AI coding assistants
  .cursor/rules/          # Cursor project rules
  projects/
    army-builder/         # Valour & Fortitude army list builder
      README.md           # Project-specific docs
      index.html
      app.js
      data/               # Game reference data (unit catalogs)
        catalog.json
        armies/*.json
```

## Projects

| Project | Folder | Public URL | Description |
|---------|--------|------------|-------------|
| Valour & Fortitude Army Builder | `projects/army-builder/` | `/projects/army-builder/` | Build napoleonic army lists and export PDFs |

On Netlify, `/army-builder/` also works via rewrite (legacy short URL).

See each project's `README.md` for project-specific details.

## Local development

No build step. Serve the repo root with any static file server:

```bash
npx serve .
```

Then open:

- Home: http://localhost:3000/
- Army Builder: http://localhost:3000/projects/army-builder/

On Netlify, `/army-builder/` is rewritten to the same app. Use relative asset paths inside projects so both hosts work without a build step.

## Adding a new project

1. Create `projects/<slug>/` with the app's `index.html` and assets.
2. Add a project card to `index.html` on the home page.
3. Add a `projects/<slug>/README.md` describing the project.
4. Link from the home page using `/projects/<slug>/` (site is served from the domain root).
5. On Netlify only: optionally add a short-URL rewrite in `netlify.toml`:

   ```toml
   [[redirects]]
     from = "/my-tool/*"
     to = "/projects/my-tool/:splat"
     status = 200
   ```

6. Optionally add a scoped Cursor rule in `.cursor/rules/`.

## Deployment

- **Production branch:** `main`
- **Netlify:** pushes to `main` trigger production deploys. Only push when you intend to deploy.
- **GitHub Pages:** repo is named `denlockhart.github.io`, so the home page is served at **https://denlockhart.github.io/** (repo root → domain root). Settings → Pages → `main` / root; `.nojekyll` is in place.

- **Custom domain (`denlockhart.com`):** currently shows a Netlify placeholder. To serve this repo at the root of `denlockhart.com`, either connect the domain to this GitHub Pages site (Pages settings → Custom domain, then point GoDaddy DNS at GitHub) or deploy this repo on Netlify and attach `denlockhart.com` there.

Projects load assets with **relative paths** so the same repo works on both hosts without a build step.

## AI assistant docs

- [`AGENTS.md`](AGENTS.md) — repo-wide instructions for AI agents
- [`.cursor/rules/`](.cursor/rules/) — Cursor rules (site-wide and per-project)
