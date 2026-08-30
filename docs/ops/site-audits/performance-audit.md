# Performance audit — packages/site (revalidated)

**Method (durable):** Static review of the prerendered landing tree for font subsetting, JS islands, CSS critical path, and image formats. Budgets from the original skill (total / JS / CSS / fonts) were never re-measured here.

**Target 2026-08-30:** `pages/index.astro` → `LearnerLanding.astro` → `layouts/Landing.astro`. Live workspace mock is `LearnerWorkspaceMock.astro`, not the archived `BuddyWorkspaceMock.astro`.

## What still holds

- Zero `client:*` hydration islands on the landing tree is still the right architecture.
- Self-hosted subset `woff2` files under `packages/site/src/assets/fonts/` plus `SeoHead` preloads replaced the previous Google Fonts CSS critical path.
- `font-display: swap` + metric-matched fallbacks in `global.css` remain the CLS defense.
- Feature mocks still contain large inline scripts (`LearnerPlayMock`, `LearnerReadMock`, `LearnerWorkspaceMock`). Treat those as the remaining JS/INP cost, not a new Google Fonts payload.

## Dated / do not treat as current

- “The only external dependency is Google Fonts, which is preconnected.” Live layout preloads local fonts; PostHog is injected from `Landing.astro`.
- Line-level cites into a former `Landing.astro` document body (font `<link>`, JSON-LD at lines 20–34).
- Byte sizes from the original pass (e.g. `self-reliance.webp` 175 KB) were not re-weighed.

## Remaining work

- Pause or simplify above-fold mock animation for INP.
- Replace the `define:vars` script in `packages/site/src/components/InstallSection.astro` with data attributes (or JSON) read by a normal bundled script; its large inline body remains non-cacheable per HTML response.
- Keep archive mocks out of the production landing graph.
- If re-measuring, run a new Lighthouse/build on current `packages/site`; do not reuse `lighthouse-*.json` dumps.
