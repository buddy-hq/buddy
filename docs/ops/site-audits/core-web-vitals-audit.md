# Core Web Vitals — packages/site (revalidated)

**Method (durable):** Infer LCP/CLS/INP risks from prerendered Astro source: font loading, reserved media size, above-fold script, `prefers-reduced-motion`. Do not treat old Lighthouse JSON dumps as current scores.

**Target 2026-08-30:** `pages/index.astro` (prerendered learner landing) → `LearnerLanding.astro` → `layouts/Landing.astro` + `SeoHead.astro`.

**Dated (original audit):** Claims about Google Fonts `<link>` at `Landing.astro:67-70` and `@import` inside a live hero `BuddyWorkspaceMock.astro` applied to a previous tree. Live fonts are self-hosted `woff2` preloaded from `SeoHead.astro`. The Google Fonts `@import` remains only in `components/archive/BuddyWorkspaceMock.astro`.

## LCP

- Hero `<h1>` is in initial HTML (`LearnerHero.astro`) — still a good LCP candidate.
- Fonts: `SeoHead.astro` preloads Geist / Geist Mono / Architects Daughter; `global.css` metric-matched `@font-face` with `font-display: swap`. Remaining LCP risk is woff2 weight, not a blocking `css2?family=` stylesheet.
- Do not reintroduce CSS `@import` of Google Fonts in live mocks.

## CLS

- `global.css` still ships metric-matched Geist fallbacks. Keep reserved aspect-ratio / Astro `<Image>` dimensions on mock visuals.
- Dated: innerHTML-injected images in the archived workspace mock are not on the live learner hero path.

## INP

- Remaining risk: `LearnerWorkspaceMock.astro` typing timelines (`setTimeout` chains) and
  `LearnerReadMock.astro`'s scroll/timeline work still run from inline scripts and need
  off-screen gating or a deliberate visual simplification.
- `LearnerPlayMock.astro` now gates its `requestAnimationFrame` loop with
  `IntersectionObserver` and cancels it when the mock leaves the viewport; reduced-motion
  handling for that mock and the remaining timelines remains to verify.

No new lab metrics were collected in this pass.
