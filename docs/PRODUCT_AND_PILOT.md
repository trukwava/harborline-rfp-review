# Product brief, implementation contract & pilot

## Who, why, first unit of value

A nonprofit grants analyst must assemble an evidence-backed intake brief for a director. A typed field and source-page relationship should make every consequential claim inspectable while leaving the authority to interpret and decide with people. Use a small, deterministic core first: PDF → validated page text → cited candidate → persisted review → export.

## P0 scope versus parking lot

**P0:** opportunity and document creation; role-based classification; provenance/ingestion warnings; fixed schema; evidence-linked field review; versioned organization profile; explicitly unknown criteria; source amendment precedence proposal; human decision and audit trail; print/JSON export; persistent demo records; malformed-file and authorization guardrails. **Parking lot:** generalized LLM extraction, production tenant IAM, OCR quality metrics, background job queue, attachments checklist automation, opportunity discovery, proposal drafting, CRM sync, automated submission, hosted deployment, quantitative ROI claims.

## State rules and invariants

1. A source document is immutable to the reviewer; one `(opportunity, SHA-256)` is one document record. An amendment is not a replacement.
2. A run is append-only; rerun creates a new run and preserves accepted human field reviews. A changed proposal marks an existing review as **needing re-review** without changing its stored value.
3. A machine candidate must contain a nonempty original source line and a citation to the exact page that contains that line. Unsupported extraction is absent, not guessed. A human edit carries manual origin and is never represented as source-verbatim.
4. Eligibility comparisons only use explicit requirements and a versioned, user-maintained organization profile; lack of positive or negative credential evidence implies **unknown**, not pass or fail. A manual director decision is distinct from preliminary eligibility.
5. Deadline strings retain original wording; parse to an exact UTC instant only if the original has an explicit date, time and recognized timezone. A date-only deadline remains a date.
6. Every opportunity read/write is scoped to its organization; only demo director may record the decision. This demonstrates query scoping but does not constitute authentication.
7. Uploaded text, including apparent instructions inside PDFs, is treated as inert data. No embedded URLs are fetched or actions executed.

## Acceptance scenarios

| Scenario | Expected outcome | Automated evidence |
|---|---|---|
| Searchable source with an instruction-shaped sentence | Supported `Field: Value` lines are candidates with valid excerpts; injected imperative is ignored | Extraction test + seed assertion |
| Rasterized table, printed page 7 | OCR is used and warned; PDF page index 0 does not masquerade as printed 7 | Integration test |
| Credential absent from the profile | Status `unknown`, not `pass` | Unit + integration |
| Credential explicitly disclaimed | Status `fail` | Unit |
| Date amendment after a reviewed base | New citation/source proposed, original inspectable, old accepted value persists with stale flag | Integration |
| Match requirement not present | No value; never numerical zero | Integration |
| Upload same PDF, rerun extraction | No duplicate document on upload; new run on rerun; human edit intact | Integration |
| Malformed file, outsider read, analyst decision | Reject malformed PDF; deny foreign organization access; analyst cannot decide | Integration |
| Export and reopen | JSON includes review state/documents and director rationale; SQLite retained | Integration |

## Pilot (hypothesis validation, not deployment authorization)

Use **ten sanitized historical RFPs** and **two independent reviewers**, in parallel with the existing intake process. Benchmark, per RFP, wall-clock time to a director-ready brief **including field verification and correction** (not just model response time), number and severity of field errors, missed mandatory requirements, source citation validity, deadline errors, and reviewer agreement on unknowns. Investigate every unsupported critical requirement or missed deadline immediately; either is a **stop-and-investigate** trigger. Track OCR errors separately from interpretation errors and record corrections by field type. Compare medians and full error distributions to the manual baseline; do not promise savings or extrapolate ROI yet.

Five targeted discovery questions for the pilot team:

1. Which three fields most often require judgment beyond verbatim extraction, and why?
2. How do you currently discover and reconcile late amendments or deadline changes?
3. What documentary proof is required before a credential can be marked eligible?
4. Which matters more during director review: a short summary, original source excerpts, or a checklist of unresolved obligations?
5. Which formats and page structures (image scans, tables, appendices, portal forms) most often cause missing or misread requirements?

**Shadow-mode sequence:** record existing workflow baseline; anonymize ten historical RFPs; assign two reviewers blind to each other's edits; extract and review inside Harborline without external actions; adjudicate all contradictions against original pages; compare against baseline; decide whether to invest next in **generalized extraction with stronger citation validation** or in **review workflow refinement**, depending on the error distribution. A release with missed deadlines, unsupported critical eligibility, or insecure tenant access does not proceed. Buyer, price, demand, and time savings remain unverified hypotheses.
