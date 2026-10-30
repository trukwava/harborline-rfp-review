# Public GitHub publication — complete

The user-created repository [trukwava/harborline-rfp-review](https://github.com/trukwava/harborline-rfp-review) is **public**. The Evidence Edition v0.2 application was published to its `main` branch through the authenticated GitHub repository API on October 30, 2026.

## Repository contents

- Complete TypeScript/SQLite application server and domain model: `src/`
- Operational desktop and mobile UI: `public/`
- Three synthetic RFP packages, including a scan and deadline amendment: `fixtures/`
- PDF/OCR and fixture tools: `tools/`
- Integration tests: `tests/`
- Documentation and screenshots: `docs/`
- A secrets-free `.env.example`, `.gitignore`, `package.json`, and `tsconfig.json`

The original source bundle was committed locally as `aabe159` before publishing. The remote history was initialized with a README and then written through GitHub's Git data API, so the remote commit SHA is **different from the offline bundle SHA**; the release files were compared by Git blob hashes.

## Clone and run

```bash
git clone https://github.com/trukwava/harborline-rfp-review.git
cd harborline-rfp-review
python -m pip install pymupdf pillow pytesseract
npm run dev
# Open http://127.0.0.1:4173
```

Requires Node.js 22.16+, Python 3.11+, and a system Tesseract OCR executable. Run `npm test` for integration tests. No paid services or production credentials are required. The repository does **not** contain a hosted deployment.

## Release and security checklist

- Public contents contain **fictional solicitations, organizations and reviewer personas only**. No production user PDFs, user data, credentials or private keys are included.
- `data/`, `.env`, `node_modules/`, local SQLite state and uploads are ignored and excluded from the published source.
- **Do not deploy this server to the public Internet.** Reviewer identities are simulated, not authenticated; production organization isolation, user management, secure upload processing and retention controls remain unfinished.
- Do not commit real organization profiles, credential files, production funder records, database snapshots or user uploads.
- Screenshots show synthetic sample content.
- No open-source license has been added. Public visibility alone does not license reuse.
- Continue changes through reviewed commits and ideally add CI before a real pilot.
