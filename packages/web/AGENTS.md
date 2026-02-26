# AGENTS.md

## Web Learnings (non-obvious)
- Treat backend+SDK as a compatibility contract and keep web state decoupled from vendored OpenCode internals.
- Stream reconnect logic must include state reconciliation; reconnecting transport alone is not enough to guarantee correct UI state.
- Busy/idle UI state should come from authoritative message lifecycle markers after sync/recovery, not only transient local flags.
- Keep import boundaries explicit so web-only modules do not accidentally resolve into other workspace packages through aliases.
- Markdown behavior should remain consistent across parsing and rendering layers when introducing formatting/link/math/code changes.
- Desktop directory selection should prefer platform bridge APIs when available, with a safe manual fallback for unsupported runtimes.
