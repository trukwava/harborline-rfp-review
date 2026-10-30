# Harborline v0.4 — Local Demo Boundary Hardening

This update preserves the synthetic demo and tightens its isolation. It does **not** implement production authentication.

- Rejects non-loopback clients and unrecognized Host headers before demo actor resolution.
- Rejects requests whose Origin disagrees with the application's local host.
- Rejects cross-site state-changing requests identified by `Sec-Fetch-Site`.
- Sets the demonstration actor cookie with `HttpOnly; SameSite=Strict`.
- Adds `X-Frame-Options: DENY` and `Referrer-Policy: no-referrer` to standard responses.
- Adds regression tests for rejected cross-origin requests and permitted local session switching.

## Security boundary and limitations

Users may switch among synthetic actors; therefore roles do not represent actual identities. These controls are defense-in-depth only for a local demonstration. Internet hosting must remain disabled until authenticated identities, authorization, secure sessions, TLS deployment, CSRF design, and production retention have been separately implemented and tested. The service currently listens on `127.0.0.1` by design.

## Local verification

`npm test`: 5 passing tests. TypeScript static checking could not run in this sandbox because `@types/node` was not installed; it remains a required CI/developer check.
