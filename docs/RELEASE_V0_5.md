# Harborline v0.5 — Opt-in local identity and organizational membership

A separately configured local-account mode replaces the intentionally impersonable demo actors for that mode only. **This is not a hosted SaaS authentication system and remains loopback-only.** The default synthetic demo is unchanged.

## Changes

- SQLite tables for local users, memberships, sessions and login throttling, with constrained roles and foreign keys.
- Offline provisioning from environment variables; no public registration or example password. Existing passwords are not silently replaced.
- Salted scrypt password hashing and timing-safe comparison; an additional fake hash reduces account-enumeration differences.
- Password login, explicit logout, 32-byte random opaque sessions (SHA-256 token hashes in SQLite), 12-hour fixed expiry, strict HttpOnly cookies, and membership checks on every request. Five failed attempts trigger a 15-minute account-level throttle.
- Organization-scoped reads/writes and source inspection. Analysts cannot record director decisions. Deactivating a membership immediately blocks an existing session.
- A complete sign-in/sign-out UI with a clearer empty workspace; local account mode does not automatically seed fictional opportunities. Initial profile is empty and labeled unverified.
- Loopback binding, host/origin protections from v0.4 remain. Client-supplied demo actor headers are rejected in local mode. Restart can recover partial synthetic demo fixture seeding.

## How to use

Requires Node.js 22.16+ and a working Python OCR environment for documents. Run commands from the repository root.

1. Set `HARBOR_USER_EMAIL`, `HARBOR_USER_PASSWORD` (12+ chars), `HARBOR_ORGANIZATION` and `HARBOR_USER_ROLE` to `director` or `analyst`, using private environment variables.
2. Run `npm run provision:local`; do not put a password in a command-line argument or repository file. Clear the password environment variable after provisioning.
3. Run `AUTH_MODE=local DEMO_MODE=false npm run dev`; open http://127.0.0.1:4173/ and sign in.
4. Repeat provisioning with another email and role to add local members. Use the same organization slug for shared opportunity access.

The initial organization profile contains no verified eligibility credentials. Local-mode users must supply and review their own organizational evidence. The default `AUTH_MODE=demo` continues to use fictional switchable personas and seeded PDFs.

## Verification and limits

`npm test`: 6 passing; `npm run typecheck`: passes with Node type definitions installed; `node --check public/app.js`: passes. Desktop and mobile component checks cover the local sign-in, empty state, and sign-out, while the HTTP tests cover server security controls.

**Not suitable for public deployment:** no TLS, production identity provider, managed account recovery, distributed abuse protection, documented key rotation, audited hosted tenancy, or production retention/deletion process. Cookies intentionally omit `Secure` because this mode serves localhost over HTTP. Before remote hosting, add and test all of these safeguards.
