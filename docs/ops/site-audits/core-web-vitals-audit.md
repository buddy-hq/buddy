# Core Web Vitals Audit — packages/site landing page

Static code review of the prerendered Astro landing page (`packages/site/src/pages/index.astro`) and its full dependency tree, measured against the `core-web-vitals` Agent Skill (LCP ≤ 2.5s, INP ≤ 200ms, CLS ≤ 0.1). No dev server, Lighthouse, or build was run; all findings are inferred from source.

## Summary

The landing page is statically prerendered (`export const prerender = true` in `index.astro:12`) with no Astro client hydration islands (zero `client:*` directives anywhere in `src/`), so there is no framework hydration tax. The likely LCP element is the hero `<h1>` text, which is in the initial HTML — a good baseline. CLS is well defended: a metric-matched `Geist Fallback` `@font-face` (`global.css:4-11`) is wired into every font stack, and all `<img>`/mockup visuals either use Astro `<Image>` (auto dimensions) or have CSS `aspect-ratio`/fixed dimensions reserving space.

The main risks are (1) two render-blocking Google Fonts `@import` statements embedded inside `<style>` blocks — one in the above-the-fold hero mockup — which serialize CSS loading and delay LCP; (2) a render-blocking Google Fonts `<link>` in `<head>` that could be converted to the preload-then-activate pattern; and (3) a large (~1,300-line) inline script in `BuddyWorkspaceMock.astro` that runs immediately on page load and drives continuous `setTimeout`-based typing/`innerHTML` animations in the above-the-fold hero, keeping the main thread busy and threatening INP. A below-the-fold canvas game mock (`LearnerPlayMock.astro`) starts a `requestAnimationFrame` loop on intersection but never pauses it when scrolled away.

## Findings

### LCP

**High — Render-blocking `@import` for Google Fonts inside `<style>` block (above the fold).**
`BuddyWorkspaceMock.astro:1376`:
<ref_snippet>
@import url('https://fonts.googleapis.com/css2?family=Architects+Daughter&display=swap');
</ref_snippet>
CSS `@import` is render-blocking and forces the browser to fetch the stylesheet serially before it can finish parsing the embedding stylesheet. This component is rendered inside the hero (`Hero.astro:40`), so it is above the fold and directly on the LCP critical path. The same `@import` is duplicated in `LearnerDrawMock.astro:151` (below the fold, so lower impact but still wasteful). Per the skill's LCP checklist ("No render-blocking JavaScript in `<head>`" / critical-CSS pattern), `@import` should be replaced with a `<link rel="preload">` + `onload` swap in `<head>`, or self-hosted.

**Medium — Render-blocking Google Fonts `<link>` in `<head>`.**
`Landing.astro:67-70`:
<ref_snippet>
<link
  href="https://fonts.googleapis.com/css2?family=Geist:wght@300..700&family=Geist+Mono:wght@300..600&display=swap"
  rel="stylesheet"
/>
</ref_snippet>
This is a render-blocking stylesheet. The CLS impact is already mitigated by the metric-matched `Geist Fallback` (`global.css:4-11`) in the font stack, but the blocking fetch still delays first paint / LCP. The skill's recommended pattern is `<link rel="preload" as="style" onload="this.onload=null;this.rel='stylesheet'">`. Preconnects are already present (`Landing.astro:65-66`), which is good.

**Medium — Large unoptimized public asset (`self-reliance.webp`, 175 KB) served raw.**
`public/self-reliance.webp` is 175 KB and referenced by a plain `<img src="/self-reliance.webp">` (not Astro `<Image>`), so it is served as-is with no optimization/resizing. It appears in `LearnerReadMock.astro:23` (below fold) and is injected via `innerHTML` in `BuddyWorkspaceMock.astro:93` (above fold, inside a 44×60 px card). At 44×60 display size, 175 KB is far larger than needed. Moving it through `astro:assets` `<Image>` would generate correctly sized variants.

**Low — No Speculation Rules for likely-next navigations.**
The skill recommends a `<script type="speculationrules">` block with `eagerness: "moderate"` to prerender likely-next pages (e.g. `/docs`). None is present in `Landing.astro`. This is a progressive-enhancement opportunity, not a regression.

### CLS

**Low — Dynamically injected `<img>` via `innerHTML` in chat messages.**
`BuddyWorkspaceMock.astro:93` injects `<img class='ill-cover' src='/self-reliance.webp' ...>` into the chat feed during the streaming simulation. The `.ill-cover` class does reserve fixed dimensions (`width: 44px; height: 60px` at `BuddyWorkspaceMock.astro:2021-2023`), so no shift is expected from the image itself. The residual risk is the surrounding chat-bubble height changing as HTML streams in char-by-char (`container.innerHTML = currentText` at `BuddyWorkspaceMock.astro:227`), but this is a deliberate animated mockup, and the bubble grows downward inside a scroll container. Acceptable.

**Pass (noted for completeness) — `.reveal` opacity/transform on install section.**
`InstallSection.astro:8` uses `class="install-section reveal"`. `.reveal` sets `opacity: 0; transform: translateY(24px)` (`global.css:385-391`) and is revealed via `IntersectionObserver` (`Landing.astro:91-103`). Because only `opacity`/`transform` are animated (not layout properties), this does not cause CLS. `prefers-reduced-motion` forces it visible (`global.css:491-494`), so content is never permanently hidden if JS is disabled.

### INP

**High — Continuous `setTimeout`/`innerHTML` animation script in the above-the-fold hero.**
`BuddyWorkspaceMock.astro:68-1373` is a ~1,300-line inline script that runs on load. After an 800 ms `setTimeout` (`BuddyWorkspaceMock.astro:1370-1372`) it begins a streaming chat simulation that:
- types user input char-by-char into a `<textarea>` (`BuddyWorkspaceMock.astro:551-558`), recomputing `scrollHeight` each char,
- streams buddy messages by rebuilding `container.innerHTML` chunk-by-chunk (`BuddyWorkspaceMock.astro:223-230`),
- animates a whiteboard by repeatedly creating elements and setting `innerHTML` with many `await setTimeout` steps (`BuddyWorkspaceMock.astro:233-498`).

This produces a steady stream of layout/paint work on the main thread for the entire duration of the hero animation. While each `setTimeout` yields, the cumulative effect leaves little idle time and can push interaction latency past the 200 ms INP target, especially on low-end devices. The script also has no `requestIdleCallback`/`scheduler.yield` gating as recommended by the skill. Consider (a) pausing the simulation when the hero is off-screen, (b) using `scheduler.yield()` between chunks, (c) reducing `innerHTML` rebuilds (diff/append instead of full replace), and (d) deferring the start until the browser is idle.

**Medium — `requestAnimationFrame` game loop starts on intersection but never pauses.**
`LearnerPlayMock.astro:655` calls `requestAnimationFrame(draw)` recursively. The loop is started by an `IntersectionObserver` (`LearnerPlayMock.astro:664-669`) which `unobserve`s immediately and calls `startGame()` once — so once the mock scrolls into view the canvas game runs forever, even after the user scrolls away. A continuous rAF loop keeps the main thread busy and can hurt INP on the rest of the page. The observer should re-observe on scroll-out and cancel the rAF (`cancelAnimationFrame`) when the mock leaves the viewport.

**Low — Scroll listener toggles a class on every scroll event.**
`Header.astro:243-252` adds a (passive) `scroll` listener that toggles `toggle-hidden` on `.audience-toggle` based on `window.scrollY > 20`. It is `{ passive: true }` (good) and only flips a class at the threshold, so cost is minimal, but it runs on every scroll frame. Could be debounced/throttled with `requestAnimationFrame` for cleanliness.

## Passes

- **No hydration islands.** Zero `client:*` directives in `src/` — all scripts are plain Astro `<script>` tags (bundled as `type="module"`, deferred by default). No framework hydration tax on INP.
- **Prerendered HTML.** `index.astro:12` sets `prerender = true`; the LCP `<h1>` (`Hero.astro:13-16`) is in the initial server-rendered HTML, not JS-rendered.
- **Metric-matched font fallback.** `global.css:4-11` defines `Geist Fallback` with `size-adjust`/`ascent-override`/`descent-override`, included in every font stack (`global.css:75-83`). This is exactly the skill's recommended CLS mitigation for `font-display: swap`.
- **Preconnect to font origins.** `Landing.astro:65-66` preconnects to `fonts.googleapis.com` and `fonts.gstatic.com` (crossorigin).
- **Astro `<Image>` used for the header logo.** `Header.astro:2,12` imports `Image` from `astro:assets` and uses it for `buddy-app-icon.png` (1 MB source, 1254×1254), which Astro will resize/optimize and to which it adds explicit `width`/`height`.
- **Images have reserved space.** `LearnerReadMock.astro:210-213` gives `.book-cover` `aspect-ratio: 0.67 / 1` with the `<img>` at `width:100%; height:100%` (`:228-230`); `BuddyWorkspaceMock.astro:2021-2023` fixes `.ill-cover` to 44×60. No dimensionless images found in the audited tree.
- **Animations use transform/opacity, not layout properties.** Hover/active states use `transform: translateY`/`scale` (e.g. `Hero.astro:210-226`, `FeatureSteps.astro:204-209`), matching the skill's CLS guidance.
- **Reduced-motion support.** `global.css:483-498` collapses animation/transition durations and forces `.reveal` visible under `prefers-reduced-motion`.
- **Below-the-fold mocks gate work on `IntersectionObserver`.** All 10 feature mocks start their animations only when scrolled into view, avoiding upfront main-thread cost.
- **Passive scroll listener.** `Header.astro:251` uses `{ passive: true }`.
- `main { overflow-x: clip }` (`global.css:158-160`) helps avoid horizontal-scroll layout thrash from the wide mockups.

## Recommendations (prioritized)

1. **Remove the `@import url(...)` for Architects Daughter in `BuddyWorkspaceMock.astro:1376` and `LearnerDrawMock.astro:151`.** Move the font to a `<link rel="preload" as="style" onload="...">` in `Landing.astro` `<head>`, or self-host it. This is the single biggest above-the-fold LCP win.
2. **Convert the render-blocking Geist `<link>` in `Landing.astro:67-70` to the preload-then-activate pattern** (`<link rel="preload" as="style" href="..." onload="this.onload=null;this.rel='stylesheet'">`). Keep the existing preconnects.
3. **Reduce main-thread pressure from `BuddyWorkspaceMock.astro`'s streaming script (`:68-1373`).** At minimum: pause the simulation when the hero is off-screen (IntersectionObserver), insert `scheduler.yield()` (with `setTimeout` fallback) between message/whiteboard chunks, and stop rebuilding `innerHTML` from scratch each character (`:227`) — append nodes instead.
4. **Pause `LearnerPlayMock.astro`'s rAF loop when off-screen.** Re-observe in the `IntersectionObserver` (`:664`) and `cancelAnimationFrame` when `entry.isIntersecting` is false, instead of `unobserve`-ing permanently (`:668`).
5. **Route `self-reliance.webp` through `astro:assets` `<Image>`** (move it into `src/assets/` and import it in `LearnerReadMock.astro:23` and for the `BuddyWorkspaceMock.astro:93` chat card) so Astro generates correctly sized, optimized variants instead of serving the 175 KB original.
6. **Add a `<script type="speculationrules">` block** to `Landing.astro` with `eagerness: "moderate"` for likely-next navigations (e.g. `/docs/**`) to collapse next-page LCP.
7. **(Minor) Throttle the `Header.astro:245` scroll listener** with `requestAnimationFrame` so the class toggle runs at most once per frame.
