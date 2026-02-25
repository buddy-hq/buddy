# AGENTS.md

## SDK Learnings (non-obvious)
- Backend OpenAPI paths are `/api/*` while generated fetch client also uses `baseUrl: "/api"`; strip `/api` from schema paths in `scripts/generate.ts` to avoid `/api/api/*` requests.
- `createBuddyClient()` must set `createClient({ baseUrl: "/api" })` explicitly; a new client instance does not automatically inherit generated singleton defaults.
- Keep path normalization in both schema sources (remote `/doc` fetch and local `generateSpecs(app)` fallback) so generated operations stay identical offline/online.
- `createBuddyClient({ directory })` is required for tenant routing; it injects `x-buddy-directory` (URI-safe) and avoids unintended fallback to backend `process.cwd()`.
- Treat SDK surface as Buddy compatibility API over vendored OpenCode core, not as a direct OpenCode SDK mirror.
