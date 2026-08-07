# Routewise

Multi-stop route planner built with Google Maps and the Routes API.

## Run locally

1. Copy `maps-config.example.js` to `maps-config.js`.
2. Add your Google Maps API key to `maps-config.js`.
3. Run `py -m http.server 5173` and open `http://localhost:5173`.

`maps-config.js` is intentionally ignored by Git so API keys are never committed.

## Deploy to GitHub Pages

The workflow in `.github/workflows/deploy-pages.yml` deploys `main` to GitHub Pages.

1. In GitHub, open **Settings → Secrets and variables → Actions** and add the secret `GOOGLE_MAPS_API_KEY` with your Maps key.
2. Open **Settings → Pages** and select **GitHub Actions** as the source.
3. Add `https://givikooo.github.io/routewise/*` to the key's HTTP referrer restrictions in Google Cloud.

The live URL is `https://givikooo.github.io/routewise/`.
