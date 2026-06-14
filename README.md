# Gunnison Basin Fishing Conditions

A live fishing-conditions dashboard for the Gunnison Basin in Colorado, hosted on
GitHub Pages: **https://jaymorse.github.io/Gunny/**

The dashboard shows, in real time:

- **USGS streamflow, gauge height, and water temperature** for six basin gauges
  across the Taylor, East, Gunnison, and Tomichi rivers.
- **NWS weather** for Gunnison, CO.
- An **automated per-river fishability rating** derived from current conditions.
- A **season-aware hatch guide** that highlights the bugs likely to be active now.

## How it works

All data is fetched **client-side in your browser** — there is no backend and no
API keys. The page calls the public APIs directly, both of which send open CORS
headers:

- Streamflow, gauge height, and water temperature come from the
  [USGS NWIS Water Services API](https://waterservices.usgs.gov/).
- Weather comes from the [NOAA / National Weather Service API](https://api.weather.gov/).

## Deployment

The site is a single static `index.html` at the repository root, deployed to
GitHub Pages via the workflow in `.github/workflows/static.yml` on every push to
`main`.

## Credits

Data courtesy of **USGS NWIS** and the **NOAA / NWS API**.
