# Harborline v0.6 — Evidence Atelier

**Date:** October 31, 2026 · **Distribution:** source repository; local synthetic-data demonstration.

## Goal

Make the evidence-workflow interface feel like a purpose-designed editorial instrument without compromising its decision-support boundaries.

## New

- Offline-ready visual design system with maritime green, parchment, brass, cartographic geometry, optical type hierarchy, consistent focus affordances, and responsive paper-like evidence panels.
- Restructured fixed desktop navigation and responsive mobile presentation; no browser horizontal overflow at 390 or 1440 pixel widths in visual checks.
- Real keyboard command palette (Ctrl/Cmd+K) supporting opportunity navigation, tab jumps, profile view, opportunity creation, and advancing to the next review field. Client-side commands are derived only from opportunities already returned for the authorized session.
- Keyboard and Escape handling, dialog semantics, visible focus, reduced-motion mode, explicit auth-locked palette behavior.
- Release screenshots: `docs/atelier-desktop.png`, `docs/atelier-mobile.png`, `docs/atelier-command-desktop.png`, `docs/atelier-command-mobile.png`.

## Verification

- `npm test`: 6/6 local backend tests passed.
- `npm run typecheck`: passed with local Node types available.
- `node --check public/app.js`: passed.
- `python tools/browser_visual_check.py`: passed, including command navigation, four tabs, citations, and amendment selection.
- `python tools/browser_atelier_check.py`: passed at desktop (1440 × 930) and mobile (390 × 844), including keyboard navigation and overflow.
- `python tools/browser_local_visual_check.py`: passed for local sign-in/sign-out and empty state.

**Browser limitation:** Browser visual tests hydrate an actual rendered page with synthetic server API snapshots, rather than connecting the browser itself to localhost. The backend tests exercise the actual HTTP server separately.

## Important constraints

- The application remains **localhost-only** and is **not an internet-ready or hosted production service**.
- The example nonprofit, issuers, RFPs, and user sessions are fictional. No external customer integration or automatic grant submission.
- The command palette is navigation, not arbitrary source search; it never executes instructions found in a PDF.
- No external fonts or illustration services; all ornamentation is CSS and local markup.

## Next candidate iteration

A static, read-only, synthetic public tour could be deployed independently of sensitive workflows; hosting and security review remain separate decisions.
