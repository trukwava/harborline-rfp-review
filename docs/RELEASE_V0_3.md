# Harborline Evidence Edition v0.3 — citation integrity and decision packet

**Release scope:** a synthetic-data demonstration intended for analyst review and director discussion. Not a hosted, authenticated, or production-ready grants system.

## Shipped

- **Documentary change register:** a fourth workspace tab (`Source revisions`) shows the retained source sequence and contrasting values side by side. Each alternative opens its exact PDF page and excerpt for inspection.
- **Explicit cited-version acceptance:** when an amendment changes a field, a reviewer can confirm either the earlier or newer candidate. The server validates that the candidate belongs to the selected field and opportunity; it persists the accepted value and source candidate ID separately from the latest proposal. Reprocessing does not erase or misattribute that choice.
- **Attribution-correct projections:** machine proposals and accepted citations are distinguished in `GET /api/opportunities/:id`, the structured `GET /api/opportunities/:id/packet.json`, and the revised printable `GET /api/opportunities/:id/print`. Manual edits never masquerade as quotations; a previously confirmed value requiring re-review remains attributed to its original citation.
- **Director packet:** designed print layout with field readiness, critical open items, non-pass eligibility criteria, version comparisons, director rationale, sources, and per-field attestation status. Use the browser's **Print / Save as PDF** command to create a PDF; no PDF generator or DOCX writer has been added.
- **Visuals:** `docs/revisions-preview.jpg` and `docs/director-packet-preview.jpg` are generated using synthetic data. Both remain viewable in the public repository.

## Validation

- `npm test` — four passing suites, including integrated amendment, authorization, persistence and packet assertions.
- `npm run typecheck` — passes when TypeScript and Node types are available. The build can run without npm packages as described in the README.
- `npm run test:visual` — desktop/mobile component smoke checks pass for four tabs, source revision inspection, field controls and responsive layout. This runner uses live HTTP snapshots injected into the page; it is not a connected-browser end-to-end test.

## Important limitations

1. Deterministic `Field: Value` extractor and local Tesseract OCR only; scanned-source text may require correction.
2. **No real authentication**: demo personas are selectable; do not deploy this system on a public host.
3. The term **newest proposal** means most recently ingested amendment in this demo, *not* a legal determination that an amendment is valid, controlling, or complete.
4. Eligibility checks cover three illustrative rules and are deliberately conservative. Unknown remains unknown.
5. Field review and deadline normalization are separate: the dashboard's deadline strip labels the newest **proposed** source value, even if an earlier reviewed value remains accepted.
6. A director may record a discussion decision with unresolved items. The packet exposes those items; it does not certify the opportunity as eligible or decision-ready.

## Follow-on scope

Pilot the change register on sanitized, real historical solicitations, test misleading amendment language, extend candidate-level review to all conflicting requirements, introduce an authenticated tenant model before any production use, and add machine-readable provenance for uploaded organization evidence. Do not publish unsanitized files.
