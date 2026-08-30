# Landing page production checklist

Revalidated 2026-08-30 against `packages/site/src/pages/index.astro` → `LearnerLanding.astro` → `layouts/Landing.astro` + `components/SeoHead.astro`. Original line cites against a former `Landing.astro` body are **void**.

Method: static source review. No Lighthouse numbers were re-run; any byte/LCP figures from the earlier audit are **dated**.

## Current (still to do)

- [ ] **INP:** Hero and feature mocks (`LearnerWorkspaceMock.astro`, `LearnerReadMock.astro`) still drive `setTimeout` / `requestAnimationFrame` loops in inline scripts. Gate or pause when off-screen.
- [x] **INP:** `LearnerPlayMock.astro` now starts and stops its `requestAnimationFrame` game loop through `IntersectionObserver`; pause-on-leave is shipped. Keep the remaining `prefers-reduced-motion` work.
- [ ] **Reduced motion:** Add or verify `prefers-reduced-motion` handling for `LearnerPlayMock.astro` and the remaining mock animation scripts.
- [ ] **JavaScript:** Replace the `define:vars` script in `InstallSection.astro` with data attributes (or JSON) read by a normal bundled script; its large inline body remains non-cacheable per HTML response.
- [ ] **Archive only:** `components/archive/BuddyWorkspaceMock.astro` still `@import`s Google Fonts. Live landing does not import that file; do not copy the archive mock back without dropping the `@import`.

## Current (done vs original checklist)

- [x] Self-hosted Geist / Geist Mono / Architects Daughter `woff2` with `SeoHead.astro` `rel="preload"` (not render-blocking Google Fonts `<link>` on the live layout).
- [x] Canonical, OG, Twitter (`@hibuddyai`), JSON-LD graph (`SoftwareApplication` + `Organization` + `WebSite` + `WebPage`) in `SeoHead.astro`.
- [x] JSON-LD `Offer` includes `availability` and `url`.
- [x] `Organization.sameAs` filled from `content/site.ts`.
- [x] Metric-matched `@font-face` fallbacks in `styles/global.css`.
- [x] Index is prerendered (`export const prerender = true`).
