# Copilot instructions

- this project consists of two main parts
    - python data scraper that builds a sqlite index
    - react dashboard that gets statically served -- it runs fully client-side using sql.js
- the scraper
    - clones canonical/chisel-releases
    - parses slice definition files (SDFs)
    - writes a local sqlite db
    - Brotli-compresses it as index.db.br to be served with the dashboard
- data scraper uses uv to manage virtual environments and dependencies
- the dashboard uses npm to manage dependencies and build the static files using webpack
- dashboard UI uses Canonical React Components + vanilla-framework; styling lives in dashboard/src/style.scss
- the dashboard uses webpack to bundle the static files
