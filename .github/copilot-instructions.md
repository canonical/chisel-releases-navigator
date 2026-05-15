# Copilot instructions

- this repo holds only the react dashboard. the sqlite index is built by a separate scraper living in `canonical/chisel-releases-data` and pulled in as a github action artifact at build time (see `.github/workflows/build-and-deploy.yaml`).
- the dashboard
    - is statically served via github pages at https://canonical.github.io/chisel-releases-navigator/
    - runs fully client-side using sql.js
    - loads the Brotli-compressed `index.db.br` shipped alongside the bundle
- the upstream scraper (separate repo, not in this tree)
    - clones canonical/chisel-releases
    - parses slice definition files (SDFs)
    - writes a sqlite db
    - Brotli-compresses it as `index.db.br` and publishes it as an artifact named `chisel-releases-data`
    - uses uv to manage virtual environments and dependencies
- the dashboard uses npm/yarn to manage dependencies and webpack to bundle the static files
- builds run inside a docker image (see `Dockerfile`, `makefile`); host doesn't need node/yarn installed
- dashboard UI uses Canonical React Components + vanilla-framework; styling lives in `dashboard/src/style.scss`
- the data model between the upstream scraper and the dashboard needs to be kept in sync -- schema changes in `chisel-releases-data` require matching updates in `dashboard/src/components/SliceTableViewer.jsx` and friends
