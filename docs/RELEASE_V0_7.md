# Harborline v0.7 — Public Evidence Atelier

**Status: static, synthetic-only interactive demonstration; not a hosted production grants system.**

## What changed

- Added a GitHub Pages-ready static site in `/docs`, preserving the v0.6 editorial workspace design.
- The static demo is built from the actual bundled fictional PDFs using `npm run demo:export`, not from invented marketing records. Every proposed field preserves its source excerpt, source document, and PDF page index. Scanned pages have pre-generated OCR-backed images.
- Visitors can use a four-stop guided tour, inspect the original and amended deadline, compare eligibility, simulate analyst/director roles, confirm or manually edit fields, and download review JSON and director packets.
- Changes are stored only in the visitor's browser (localStorage where available). **No public API, accounts, file uploads, external funder links, or application submissions** are supported. Reset restores all three fictional cases.
- A visible demo ribbon, source link, and print/export disclaimers distinguish demonstration behavior from a production review.

## Preview and publication

Run `python -m http.server 8765 --directory docs` and open `http://127.0.0.1:8765/`. To enable GitHub Pages in the repo: Settings → Pages → Build and deployment → Deploy from a branch → `main` / `/docs` → Save. GitHub Pages source setting must be enabled by a repository administrator; uploading files to GitHub does not automatically enable hosting. The expected URL after enabling Pages is `https://trukwava.github.io/harborline-rfp-review/`, but verify it rather than assuming publication.

To regenerate static sample data, use `npm run demo:export`. The exporter creates an isolated temporary data directory and refuses to read the user's real local data directory. It retains only synthetic source document metadata, source page images, field candidates, profile, and review state.

## Verification

- `npm test`: core domain/security tests plus public fixture integrity tests.
- `python tools/browser_public_demo_check.py`: actual static application JS, CSS, and synthetic JSON verified with browser `set_content` because browser navigation to localhost is blocked in this environment. Tests do not prove a public deployment is reachable.
- `node --check docs/app.js docs/demo/static.js docs/demo/tour.js` (check separately or loop).

## Limitations

This is a browser-local simulation, not hosted authentication. Simulated director/analyst role selection provides no security; no real data is permitted. Browser storage can be cleared and cannot support shared or auditable multi-user review. The primary local application remains the place for real PDF processing, and itself remains restricted to localhost pending further security work.
