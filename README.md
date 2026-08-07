# Routewise

Multi-stop route planner powered entirely by TomTom: map tiles, USA address suggestions, route calculation, and traffic-aware route sections.

## Run locally

1. Copy `maps-config.example.js` to `maps-config.js`.
2. Add your TomTom API key to `maps-config.js`:
   ```js
   window.ROUTEWISE_TOMTOM_API_KEY = 'YOUR_TOMTOM_API_KEY';
   ```
3. Run `py -m http.server 5173` and open `http://localhost:5173`.

`maps-config.js` is intentionally ignored by Git, so a key is never committed.

## TomTom services used

- Map Display API — base map tiles.
- Search API — USA address suggestions and coordinate lookup.
- Routing API — multi-stop routing, truck restrictions, and traffic sections.

The usage card is a per-browser estimate. Check the TomTom Dashboard for authoritative account usage.

## Deploy to GitHub Pages

The workflow in `.github/workflows/deploy-pages.yml` deploys `main` to GitHub Pages.

1. Create a TomTom API key in [TomTom Developer Portal](https://developer.tomtom.com/).
2. In GitHub, open **Settings → Secrets and variables → Actions** and add the secret `TOMTOM_API_KEY`.
3. Open **Settings → Pages** and select **GitHub Actions** as the source.
4. Push to `main`, or run **Actions → Deploy Routewise to GitHub Pages → Run workflow**.

The live URL is `https://givikooo.github.io/routewise/`.

> GitHub Pages is a public static site, so its browser runtime can be inspected. For a production service, send Search and Routing requests through your own backend proxy instead of exposing a long-lived key in the deployed JavaScript.
