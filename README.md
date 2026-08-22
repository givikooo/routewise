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

## Live driver tracking

The app now includes a dispatcher fleet list and a driver mode. With no extra setup it works as a local demo between tabs in the same browser. For real live tracking between driver phones and the dispatcher:

1. Create a Supabase project and run [supabase/live-tracking.sql](supabase/live-tracking.sql) in its SQL Editor.
2. Copy `live-config.example.js` to `live-config.js` and add the project's URL and anon/publishable key.
3. Deploy over HTTPS (geolocation is blocked on ordinary HTTP outside `localhost`).

The dispatcher refreshes the fleet every 10 seconds; a driver is shown online while their latest location is less than one minute old. The included database policies are deliberately an MVP so you can test the feature. Before production, add Supabase Auth and restrict each driver to their own organization and location row.

## Driver PWA

On a phone, open the deployed app and use **მძღოლის რეჟიმი** → **აპის დაყენება**. Android/Chrome shows an install prompt; on iPhone use Safari's **Share → Add to Home Screen**. The installed app opens in its own window and keeps the app shell available offline, but mobile operating systems can still pause GPS when an app is backgrounded or closed. Continuous background tracking needs a native mobile app.

## Deploy to GitHub Pages

The workflow in `.github/workflows/deploy-pages.yml` deploys `main` to GitHub Pages.

1. Create a TomTom API key in [TomTom Developer Portal](https://developer.tomtom.com/).
2. In GitHub, open **Settings → Secrets and variables → Actions** and add these secrets:
   - `TOMTOM_API_KEY`
   - `SUPABASE_URL` — your Supabase Project URL
   - `SUPABASE_PUBLISHABLE_KEY` — your Supabase Publishable key
3. Open **Settings → Pages** and select **GitHub Actions** as the source.
4. Push to `main`, or run **Actions → Deploy Routewise to GitHub Pages → Run workflow**.

The live URL is `https://givikooo.github.io/routewise/`.

> GitHub Pages is a public static site, so its browser runtime can be inspected. For a production service, send Search and Routing requests through your own backend proxy instead of exposing a long-lived key in the deployed JavaScript.
