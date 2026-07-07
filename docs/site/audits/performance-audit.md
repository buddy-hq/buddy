# Performance Audit — packages/site landing page

Audit target: `packages/site/src/pages/index.astro` and its full dependency tree
(`Landing.astro`, `Header.astro`, `Hero.astro` → `BuddyWorkspaceMock.astro` + `Mock*`,
`PhilosophyNew.astro`, `FeatureSteps.astro` → 10 `features/mocks/*.astro`,
`CapabilitiesSection.astro`, `BringYourOwn.astro` → `BYOOption.astro`, `InstallSection.astro`,
`Footer.astro`, `src/styles/global.css`, `src/content/site.ts`, `astro.config.mjs`).

Method: static code review only (no build, no dev server, no Lighthouse). Measured against the
`performance` Agent Skill budgets: Total < 1.5 MB, JS < 300 KB, CSS < 100 KB, above-fold images
< 500 KB, fonts < 100 KB, third-party < 200 KB.

## Summary

The landing page is in good shape architecturally: it is prerendered to static HTML
(`index.astro:12`), uses **zero client hydration islands** (no `client:*` directives anywhere in
the tree), ships no third-party analytics/tag-manager scripts, and has a thoughtful metric-matched
font fallback (`global.css:4-11`) plus `prefers-reduced-motion` handling (`global.css:483-498`).
The only external dependency is Google Fonts, which is preconnected.

The main performance risks are (1) a **render-blocking Google Fonts stylesheet** with no preload or
self-hosting, (2) a **very large decorative JS payload** — `BuddyWorkspaceMock.astro` alone has a
~3,600-line inline `<script>` that runs on every load to animate the hero mockup, plus ten mock
components each with their own animation scripts, all of which execute eagerly even though most
mocks are far below the fold, and (3) **unoptimized raster images** served from `public/` via plain
`<img>` (no dimensions, no `loading="lazy"`, no `srcset`). None of these are budget-busting on
their own, but together the eager JS execution is the most likely source of TBT/INP regression on
mid-range mobile.

## Findings

### Fonts

- **[High] Render-blocking Google Fonts stylesheet.**
  `Landing.astro:67-70` loads `https://fonts.googleapis.com/css2?family=Geist...&family=Geist+Mono...`
  via a plain `<link rel="stylesheet">`. This CSS request is on the critical path and blocks first
  render. `display=swap` is set (good — FOUT, not FOIT) and `preconnect` to both `fonts.googleapis.com`
  and `fonts.gstatic.com` is present (`Landing.astro:65-66`), but the stylesheet itself is still
  render-blocking and introduces a third-party round-trip. The project's own `pages/todo.md:20`
  already notes "Self-host Outfit + Plus Jakarta Sans fonts (eliminate Google Fonts render-blocking
  dependency)".

  <ref_snippet file="src/layouts/Landing.astro" lines="65-70">
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link
    href="https://fonts.googleapis.com/css2?family=Geist:wght@300..700&family=Geist+Mono:wght@300..600&display=swap"
    rel="stylesheet"
  />
  </ref_snippet>

- **[Medium] No preload for critical font files.**
  Even with the Google Fonts CSS, the actual `.woff2` files are discovered only after the CSS
  downloads and parses. There is no `<link rel="preload" as="font" type="font/woff2" crossorigin>`
  for the primary Geist weights. The skill recommends preloading critical fonts.

- **[Pass] Metric-matched fallback font.**
  `global.css:4-11` defines a `"Geist Fallback"` face using `local("Arial")` with
  `size-adjust`/`ascent-override`/`descent-override`, and the `--font-display`/`--font-body`
  stacks (`global.css:75-80`) place it ahead of the system stack. This minimizes CLS/FOUT while the
  web font loads — exactly the pattern the skill recommends.

### JavaScript

- **[High] Very large eager animation script in the hero mockup.**
  `BuddyWorkspaceMock.astro:68` opens a `<script>` that runs to line ~3622 — typing animations,
  whiteboard streaming, notebook switching, chat-feed rendering, `setInterval`/`setTimeout` loops,
  and direct `innerHTML` writes. This is a module script (Astro hoists/bundles it, so it is
  deferred and non-parser-blocking), but it still executes on every landing-page load and performs
  substantial main-thread work for a decorative mockup. There is no gating behind
  `IntersectionObserver` or `requestIdleCallback`, and no code-splitting.

  <ref_snippet file="src/components/BuddyWorkspaceMock.astro" lines="68-69">
  <script>
    // Data for notebooks matching real app structure
  </ref_snippet>

- **[Medium] Ten additional mock-component scripts all run eagerly.**
  Each of `LearnerReadMock`, `LearnerPlayMock`, `LearnerDrawMock`, `LearnerQuizMock`,
  `LearnerReviewMock`, `EducatorAlignMock`, `EducatorPlanMock`, `EducatorCreateMock`,
  `EducatorResearchMock`, `EducatorBuildMock` contains its own `<script>` (e.g.
  `LearnerReadMock.astro:562`, `LearnerPlayMock.astro:106`, `EducatorAlignMock.astro:268`). Because
  `FeatureSteps.astro:26-77` renders all five learner mocks **and** all five educator mocks in the
  DOM simultaneously (toggled via `.swap`), all ten scripts' logic is wired up at load time even
  though only one mock per audience is visible and all are below the fold. The skill's third-party
  facade pattern (defer until `IntersectionObserver`) applies equally to these decorative
  animations.

  <ref_snippet file="src/components/features/FeatureSteps.astro" lines="54-70">
  <!-- Learners Mocks -->
  <div class="swap swap-content swap-audience-learners active">
    {i === 0 && <LearnerReadMock />}
    {i === 1 && <LearnerPlayMock />}
    ...
  </div>
  <!-- Educators Mocks -->
  <div class="swap swap-content swap-audience-educators">
    {i === 0 && <EducatorAlignMock />}
    ...
  </div>
  </ref_snippet>

- **[Medium] `define:vars` forces a large inline, non-bundled script.**
  `InstallSection.astro:543` uses `<script define:vars={{ MAC_INSTALL_CMD, WIN_INSTALL_CMD, installContent }}>`.
  In Astro, `define:vars` forces the script to be emitted **inline** (not processed/bundled as a
  module). The body is ~200 lines of modal/DOM logic (`openModal`, `closeModal`, `handleCopy`,
  `innerHTML` template strings). Inline scripts execute during HTML parsing and are not deferred;
  this one sits near the end of the document so impact is limited, but it cannot be cached
  separately and re-downloads with every HTML response.

  <ref_snippet file="src/components/InstallSection.astro" lines="543-544">
  <script define:vars={{ MAC_INSTALL_CMD, WIN_INSTALL_CMD, installContent }}>
    const commands = {
  </ref_snippet>

- **[Pass] No hydration islands, no third-party JS.**
  A repo-wide search found zero `client:*` directives in the landing-page tree and no
  `is:inline`/analytics/tag-manager scripts. The only external request is the Google Fonts
  stylesheet. This keeps the JS bundle small and avoids hydration cost entirely.

- **[Pass] `prerender = true`.**
  `index.astro:12` sets `export const prerender = true`, so the route is emitted as static HTML
  despite `output: "server"` + the Cloudflare adapter (`astro.config.mjs:31-32`). Good TTFB
  characteristics.

### CSS

- **[Medium] Heavy use of `<style is:global>` merges component CSS into one render-blocking sheet.**
  `Header.astro:32`, `Hero.astro:48`, `PhilosophyNew.astro:47`, `BringYourOwn.astro:63`,
  `BYOOption.astro:28`, `InstallSection.astro:90`, and `Footer.astro:13` all use
  `<style is:global>`. Astro therefore combines them with `global.css` (545 lines) into a single
  global stylesheet that is render-blocking. `FeatureSteps.astro:82` and
  `CapabilitiesSection.astro:87` use scoped `<style>` (good). The global sheet is well-structured
  with design tokens, but the broad `is:global` usage plus pervasive `!important` overrides (e.g.
  `Header.astro:142-153`, `Hero.astro:320-326`, `FeatureSteps.astro:497-503`) increases the risk of
  unused CSS shipping to the client. Compressed size is very likely within the 100 KB budget, but
  this is worth measuring after a build.

- **[Pass] `prefers-reduced-motion` respected.**
  `global.css:483-498` zeroes out animation/transition durations and disables `.reveal`/`.swap`
  filters under reduced motion.

### Images

- **[Medium] `self-reliance.webp` served unoptimized from `public/`.**
  `public/self-reliance.webp` is 175 KB. It is referenced via a plain `<img>` in
  `LearnerReadMock.astro:23` and injected via `innerHTML` in `BuddyWorkspaceMock.astro:93`. Because
  it lives in `public/`, Astro's image pipeline (`astro:assets`) never touches it — there is no
  AVIF variant, no `srcset`, no `sizes`, no explicit `width`/`height` (CLS risk), no
  `loading="lazy"`, and no `decoding="async"`. It appears both in the hero mockup chat (above-fold,
  injected by JS) and in the `LearnerReadMock` library view (below-fold).

  <ref_snippet file="src/components/features/mocks/LearnerReadMock.astro" lines="22-24">
  <div class="book-cover webp-cover">
    <img src="/self-reliance.webp" alt="Self Reliance by Ralph Waldo Emerson" class="cover-img" />
    <div class="book-spine"></div>
  </div>
  </ref_snippet>

- **[Low] Oversized source asset for the header logo.**
  `src/assets/buddy-app-icon.png` is 1.1 MB (`Header.astro:4,12`). It is rendered through
  `astro:assets` `<Image>` at 32×32 CSS px, so the **output** is optimized — this is a build-time
  and source-control concern rather than a shipped-weight concern. Still, a 1.1 MB source for a
  32 px logo is wasteful and slows builds/image processing.

- **[Pass] Logo uses `astro:assets` `<Image>`.**
  `Header.astro:2,12` imports `Image` from `astro:assets` and uses it for the logo, so the
  shipped asset is optimized/resized at build with the Cloudflare `imageService: "compile"`
  (`astro.config.mjs:32`).

### Resource hints

- **[Medium] No preload for the LCP-critical resource.**
  There is no `<link rel="preload">` for the Google Fonts CSS or for any font file. The LCP element
  on this page is text (the `<h1>` in `Hero.astro:13-16`), so there is no LCP image to preload, but
  preloading the primary Geist `woff2` would help first paint. The skill recommends preloading
  critical fonts.

- **[Low] No Speculation Rules / prerender hints.**
  The skill suggests `<script type="speculationrules">` with `eagerness: "moderate"` for likely-next
  navigations (e.g. `/docs`). Not present. Low priority for a single landing page but cheap to add.

- **[Pass] `preconnect` to font origins.**
  `Landing.astro:65-66` preconnects to both `fonts.googleapis.com` and `fonts.gstatic.com` (the
  latter with `crossorigin`), which is correct for the Google Fonts handshake.

### Runtime

- **[Low] Ungated scroll listener in the header.**
  `Header.astro:243-251` attaches a `scroll` listener that toggles a class on every scroll event.
  It is registered with `{ passive: true }` (good — no blocking), but it is not throttled/rAF'd.
  The work is trivial (one `classList` toggle), so impact is low, but the skill recommends
  debouncing/rAF-batching scroll handlers.

  <ref_snippet file="src/components/Header.astro" lines="243-251">
  const toggleContainer = document.querySelector(".audience-toggle")
  if (toggleContainer) {
    window.addEventListener("scroll", () => {
      if (window.scrollY > 20) {
        toggleContainer.classList.add("toggle-hidden")
      } else {
        toggleContainer.classList.remove("toggle-hidden")
      }
    }, { passive: true })
  }
  </ref_snippet>

- **[Pass] Scroll-reveal uses `IntersectionObserver` and unobserves.**
  `Landing.astro:90-103` sets up `.reveal` with `IntersectionObserver` and calls
  `revealObs.unobserve(entry.target)` after revealing — efficient and one-shot.

## Passes

- **Prerendered to static HTML** (`index.astro:12`) despite `output: "server"` — fast TTFB.
- **Zero hydration islands** — no `client:*` directives anywhere in the dependency tree; no
  framework runtime shipped for the landing page.
- **No third-party JS** — no analytics, tag managers, or embeds; only Google Fonts CSS is external.
- **Metric-matched font fallback** (`global.css:4-11`) ahead of the system stack reduces CLS/FOUT.
- **`font-display: swap`** on the Google Fonts request (`Landing.astro:68`) — FOUT, not FOIT.
- **`preconnect`** to both Google Fonts origins (`Landing.astro:65-66`).
- **`prefers-reduced-motion`** fully respected (`global.css:483-498`).
- **Scroll-reveal via `IntersectionObserver` with unobserve** (`Landing.astro:90-103`).
- **Passive scroll listener** (`Header.astro:251`).
- **Logo optimized via `astro:assets` `<Image>`** (`Header.astro:2,12`) with build-time image
  service (`astro.config.mjs:32`).
- **Scoped `<style>` used where appropriate** (`FeatureSteps.astro:82`,
  `CapabilitiesSection.astro:87`).
- **JSON-LD structured data** is present and non-blocking (`Landing.astro:63`).

## Recommendations (prioritized)

1. **Self-host and preload the Geist fonts (High).** Replace the render-blocking Google Fonts
   `<link>` at `Landing.astro:67-70` with self-hosted `woff2` files, a `@font-face` with
   `font-display: swap` and `unicode-range` subsetting (per `global.css` skill guidance), and
   `<link rel="preload" as="font" type="font/woff2" crossorigin>` for the primary weight(s). This
   removes a render-blocking third-party round-trip. (Already tracked in `pages/todo.md:20`.)

2. **Defer the hero mockup animation script (High).** Gate the ~3,600-line script in
   `BuddyWorkspaceMock.astro:68` behind `IntersectionObserver` (or `requestIdleCallback`) so it
   only initializes when the mockup is about to enter view, and pause when off-screen. Better:
   extract the animation logic into a separate module that is dynamically imported
   (`await import(...)`) on first interaction/visibility, so the initial parse/execute cost is
   removed from the critical path.

3. **Lazy-init the ten feature mock scripts (Medium).** In `FeatureSteps.astro`, the per-mock
   `<script>` blocks (`LearnerReadMock.astro:562`, etc.) all wire up at load. Either (a) move each
   mock's script into a dynamically-imported module triggered when its `.bookend-card-wrapper`
   intersects, or (b) consolidate the shared animation logic into one observer-driven controller so
   only the visible mock runs. This is the biggest TBT/INP win on mobile.

4. **Optimize `self-reliance.webp` (Medium).** Move it from `public/` into `src/assets/` and render
   it via `astro:assets` `<Image>` so AVIF/WebP variants + `srcset` are generated. At minimum, add
   `width`, `height`, `loading="lazy"`, and `decoding="async"` to the `<img>` at
   `LearnerReadMock.astro:23` and to the injected `<img>` string at `BuddyWorkspaceMock.astro:93`
   to prevent CLS and enable lazy decoding.

5. **Replace `define:vars` with data attributes (Medium).** In `InstallSection.astro:543`, drop
   `<script define:vars={...}>` and instead emit the constants as `data-*` attributes on the modal
   root (or a `<script type="application/json">` block). Read them from a normal bundled module
   `<script>`. This lets Astro bundle/defer/cache the script instead of inlining ~200 lines per
   HTML response.

6. **Preload the critical font file (Medium).** Once fonts are self-hosted (per #1), add
   `<link rel="preload" href="/fonts/geist-400.woff2" as="font" type="font/woff2" crossorigin>`
   in `Landing.astro` for the primary body weight.

7. **Reduce `is:global` CSS and `!important` overrides (Low).** Convert `Header`, `Hero`,
   `PhilosophyNew`, `BringYourOwn`, `BYOOption`, `InstallSection`, and `Footer` component styles
   from `<style is:global>` to scoped `<style>` where possible, and replace `!important` overrides
   with higher-specificity scoped rules. This shrinks the render-blocking global sheet and reduces
   unused CSS. Measure the built CSS size to confirm it stays under the 100 KB budget.

8. **Right-size the logo source asset (Low).** Replace `src/assets/buddy-app-icon.png` (1.1 MB)
   with a source closer to the largest rendered size (e.g. 128×128 or 256×256 PNG/WebP). The
   shipped output is already optimized by `astro:assets`, but a smaller source speeds builds and
   shrinks the repo.

9. **rAF-batch the header scroll toggle (Low).** Wrap the `scroll` handler at `Header.astro:245` in
   `requestAnimationFrame` (or toggle only on direction/threshold change) to avoid running the
   callback on every scroll tick.

10. **Add Speculation Rules for likely-next navigation (Low).** Consider a small
    `<script type="speculationrules">` with `eagerness: "moderate"` for `/docs` to prerender the
    next likely destination.
