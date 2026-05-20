# KeyBpmMap

KeyBpmMap is a client-only React application for exploring the harmonic and tempo shape of an Engine DJ music library.
It reads a local SQLite database in the browser with `sql.js`, converts Engine numeric keys into Camelot notation, and renders both a polar density map and a BPM-vs-key heatmap for fast DJ library analysis.

## Features

- Browser-only Engine DJ database loading (`Track`, `Playlist`, `PlaylistEntity`)
- Engine numeric key → Camelot conversion (`0=8B ... 23=7A`)
- Polar harmonic density map and rectangular BPM heatmap
- Playlist, rating, BPM, and text filters
- Region inspection for exact track lists inside a selected cell
- Playlist transition summaries derived from playlist ordering
- Sparse / missing region surfacing
- Mock dataset mode for first-run exploration
- PNG export for both charts
- GitHub Pages-ready static deployment

## Local development

```bash
npm ci
npm run dev
```

Open the Vite dev server URL in your browser, then either:

1. Load a local Engine DJ SQLite database file (`.db`, `.sqlite`, `.sqlite3`, `.backup`), or
2. Use the built-in mock crate to explore the interface without a real library.

Typical Engine DJ database locations:

- macOS: `$HOME/Music/Engine Library/Database2/m.db`
- Windows: `%USERPROFILE%\Music\Engine Library\Database2\m.db`

## Verifying a local checkout

Because browsers restrict some file loading behavior on plain `file://` pages, verify the app through a local web server instead of opening `dist/index.html` directly.

For an interactive local checkout:

```bash
npm ci
npm run dev
```

Then open the local URL printed by Vite (usually `http://localhost:5173/`).

For a production-like local check:

```bash
npm ci
npm run build
npm run preview
```

Then open the preview URL printed by Vite (usually `http://localhost:4173/`).

## Build and lint

```bash
npm run build
npm run lint
```

## Deployment

The repository includes a GitHub Pages workflow in `.github/workflows/deploy.yml`.
When `main` is updated, the workflow builds the Vite app and deploys the generated static site to Pages.
Pull requests targeting `main` run the same build so changes are validated before merge, but they do not publish a separate preview site.
With this single-site GitHub Pages setup, the custom Actions workflow still publishes one live Pages URL for the repository, so isolated PR previews would require separate hosting or a second Pages site/repository.

## Notes

- Processing happens locally in the browser; there is no upload endpoint or server component.
- The parser is intentionally tolerant of minor schema variations by matching common column names case-insensitively.
- If a database is missing the `Track` table, the app shows a validation error instead of failing silently.
