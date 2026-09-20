# packages/site — AGENTS.md

## Product Status
- Buddy is free and open source. It is accurate to describe it that way in copy, docs, and design files.
- Buddy is local-first and requires no account. The trust story includes open source, privacy, local-first operation, and no-account use.

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
