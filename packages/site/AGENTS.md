# packages/site — AGENTS.md

## Product Status
- Buddy is **no longer open source**. Do not mention "open source" anywhere in copy, docs, or design files.
- Buddy is still free and local-first. The trust story is privacy + local-first + no-account, not open source.

## Stack
- Astro 5 + Cloudflare adapter + Starlight for /docs/
- Content config: `src/content/site.ts` (type-safe, `satisfies` pattern)
- Styles: `src/styles/global.css` with CSS custom properties
- Swap animation utilities: `.swap`, `.swap-content`, `.swap-media` in global.css

## Conventions
- Audience toggle uses `data-audience` attribute, JS syncs all `.audience-toggle-btn` instances
- `.swap-audience-{learners|educators}` naming convention for audience content blocks
- `define:vars` in Astro `<script>` for passing constants
- Constants in `src/lib/constants.ts`: `MAC_INSTALL_CMD`, `WIN_INSTALL_CMD`, `DOCS_PATH`, `GITHUB_URL`
- Install uses OS auto-detect via `navigator.userAgent.includes("Win")`

## Commands
- `bun lint` and `bun typecheck` must pass before considering tasks completed
- Run `bun typecheck` only from the repository root
- Run `bun fmt` only when the task is complete and user is satisfied
