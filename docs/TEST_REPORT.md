# Verification record — 2026-10-29

- Local Node 22.16 runtime and Node's SQLite module: application started, responded with HTTP 200 on GET `/` and `/api/opportunities`.
- Unit and integration tests: 4/4 passing (date parsing, extractor source-injection boundary, credential unknown/fail, complete HTTP/database scenario).
- Schema type checking: TypeScript 5.8.3 `tsc --noEmit` passed using locally available Node 22 types.
- Synthetic scanned PDF: rendered to an image and visually inspected; Tesseract PSM 3 recovered labeled table rows, including printed page 7.
- Browser component simulation: Chromium rendered API-backed snapshot, activated 3 tabs and 23 selectable fields, and passed mobile layout assertions. Navigation to 127.0.0.1 was browser-policy blocked, so the visual test used injected responses; not a network E2E claim.
- Not tested: production authentication or live external RFPs, generalized extraction, hosted deployment, direct DOCX generation, multi-tenant adversarial security audits, accessibility audit with assistive technology.

## Evidence Edition v0.2 — October 29, 2026

- Added searchable and status-filtered intake fields, review progress with accessible value attributes, next-unreviewed navigation, optional expanded evidence, keyboard shortcut `/` and `Alt+N`, and mobile profile access.
- Visual direction: display serif, case-file ledger, luminous decorative provenance geometry, section serialization, archival-source cards, amber/forest semantic emphasis, and reduced-motion support.
- `npm run typecheck`: PASS. `npm test`: 4/4 PASS (unchanged database behavior).
- `npm run test:visual`: PASS with added assertions for hero count, progress semantics, filters, search, expanded evidence, next action, profile dialog, 390px layout with no horizontal overflow, and three SPA tab transitions.
- Mobile visual defect found (two-column desktop grid overriding an earlier media rule) and corrected before packaging.
- Limitation unchanged: browser uses a snapshot-backed simulated network; endpoint tests run against a real local Node server separately.
