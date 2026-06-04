# Olvastin Tana · Jukola

A single-page React site charting the Olvastin Tana orienteering team's Jukola relay
history (2014–2025) and counting down to Kotka-Jukola 2026. Built with Vite + React +
[Recharts](https://recharts.org/), deployed to GitHub Pages via GitHub Actions.

## Develop

```bash
npm install
npm run dev      # local dev server
npm run build    # production build → dist/
npm run preview  # preview the production build
```

## Deploy

Every push to `main` triggers `.github/workflows/deploy.yml`, which builds the site and
publishes `dist/` to GitHub Pages. After the first push, set
**Settings → Pages → Build and deployment → Source → "GitHub Actions"** in the repo
(one-time). The live URL appears in the Actions run log and under Settings → Pages.

`vite.config.js` uses a relative `base: "./"` so assets resolve correctly under the
project-page path (`/<repo>/`) regardless of repo name. Safe here because the app ships a
single HTML page with no client-side router.

## Update the data

The whole site — tables, charts, profiles — renders from one file. Replace
[`src/data/history.json`](src/data/history.json) (keeping the same shape) and push; the
site rebuilds automatically. For design or feature changes, edit
[`src/App.jsx`](src/App.jsx) and push.
