# Landing Page Audit Checklist

Unified from the core-web-vitals, performance, and SEO audits. Ordered by priority.
`[decide]` = needs your call (user-visible content/UX/branding). `[todo]` = straight-forward implementation.

## High

- [ ] **[decide] Choose the primary `<h1>` for the landing page.** Three `<h1>` render in the DOM: `Hero.astro:13` (learners), `Hero.astro:24` (educators, both present via CSS toggle), and `LearnerReadMock.astro:57` (mockup article title). Pick which audience headline stays `<h1>`; the other becomes `<h2>`, and the mockup title drops to `<h2>` or `<p>`. *(SEO High)*
  - [ ] [todo] Implement the demotion once decided.
- [ ] **[todo] Remove the render-blocking `@import url('...Architects+Daughter...')` inside `<style>` blocks.** `BuddyWorkspaceMock.astro:1376` (above-fold, on LCP path) and `LearnerDrawMock.astro:151`. Move to a `<link rel="preload" as="style" onload="...">` in `Landing.astro` `<head>` or self-host. *(CWV High)*
- [ ] **[todo] Self-host + preload the Geist fonts.** Replace the render-blocking `<link rel="stylesheet">` at `Landing.astro:67-70` with self-hosted `woff2` + `@font-face` (`font-display: swap`, `unicode-range` subsetting) + `<link rel="preload" as="font" crossorigin>`. Removes a render-blocking third-party round-trip. Already noted in `pages/todo.md:20`. *(CWV Med, Perf High)*
- [ ] **[todo] Defer the `BuddyWorkspaceMock.astro` hero animation script.** The ~3,600-line inline `<script>` (`:68`) runs on every load and drives continuous `setTimeout`/`innerHTML` typing + whiteboard animation in the above-fold hero, pressuring INP/TBT. Gate behind `IntersectionObserver`/`requestIdleCallback`, pause when off-screen, and stop rebuilding `innerHTML` from scratch each char (append instead). Best: extract to a dynamically-imported module. *(CWV High, Perf High)*
- [ ] **[todo] Add the missing section `<h2>` in `FeatureSteps.astro`.** `featuresHeader` (learners + educators) is imported on `:17-18` but never rendered, so the section jumps `<h1>` → `<h3 class="step-title">` (`:41,47`). Render `featuresHeader.headline` as an `<h2 class="section-title">` to restore the hierarchy. *(SEO High)*

## Medium

- [ ] **[decide] Rewrite the title + meta description.** `site.ts:235` title is ~29 chars (target 50-60); `site.ts:236` description is ~95 chars (target 150-160). Needs your copy with primary keywords + a call-to-action. *(SEO Med)*
- [ ] **[decide] Provide a Twitter/X handle** for `twitter:site` and `twitter:creator`. `Landing.astro:58` has the card but no handle attribution. *(SEO Med)*
  - [ ] [todo] Add `<meta name="twitter:site" content="@...">` + `twitter:creator` once provided.
- [ ] **[decide] Decide on the `/docs` internal link.** The only anchor is `href="#"` on the logo (`Header.astro:11`); `/docs` is not linked from the landing page at all. Choose placement (header/footer), anchor text, and confirm changing the logo `href` to `/`. *(SEO Med)*
  - [ ] [todo] Add the link + change logo `href="#"` → `href="/"` once decided.
- [ ] **[todo] Complete the JSON-LD `Offer`.** `Landing.astro:29-33` is missing `availability` (`https://schema.org/InStock`) and `url` (`meta.siteUrl`). *(SEO Med)*
- [ ] **[todo] Optimize `self-reliance.webp`.** 175 KB served raw from `public/` via plain `<img>` (`LearnerReadMock.astro:23`) + JS-injected (`BuddyWorkspaceMock.astro:93`). Move to `src/assets/` and render via `astro:assets` `<Image>` for AVIF/srcset/dimensions; add `loading="lazy"` + `decoding="async"`. *(CWV Med, Perf Med, SEO Low)*
- [ ] **[todo] Lazy-init the 10 feature mock scripts.** `FeatureSteps.astro:54-70` renders all 10 mocks in the DOM; each mock's `<script>` wires up at load though only one is visible and all are below the fold. Gate each behind `IntersectionObserver` or consolidate into one observer-driven controller. *(Perf Med)*
- [ ] **[todo] Replace `InstallSection.astro:543` `define:vars` with data attributes.** `define:vars` forces ~200 lines inline (non-bundled, non-cacheable, re-downloads every HTML response). Emit constants as `data-*` and read from a normal bundled `<script>`. *(Perf Med)*
- [ ] **[todo] Pause `LearnerPlayMock.astro` rAF loop when off-screen.** `:664-669` starts a `requestAnimationFrame` game loop on intersection then `unobserve`s permanently — it runs forever. Re-observe on scroll-out and `cancelAnimationFrame` when `isIntersecting` is false. *(CWV Med)*
- [ ] **[todo] Preload the primary Geist `woff2` weight.** Once fonts are self-hosted (High #3), add `<link rel="preload" as="font" type="font/woff2" crossorigin>` in `Landing.astro`. *(Perf Med — depends on High #3)*
- [ ] **[todo] Convert content `<div>` wrappers to `<section>`.** `PhilosophyNew.astro:10`, `CapabilitiesSection.astro:6`, `BringYourOwn.astro:13` — add `aria-labelledby` pointing at the section's heading `id`. *(SEO Med)*

## Low

- [ ] **[decide] Provide social profile URLs** (Twitter, GitHub, etc.) for an `Organization` JSON-LD block (`sameAs`). Only `SoftwareApplication` is emitted today (`Landing.astro:20-34`). *(SEO Low)*
  - [ ] [todo] Add the `Organization` block once URLs are provided.
- [ ] **[todo] Reduce `<style is:global>` + `!important` overrides.** `Header.astro:32`, `Hero.astro:48`, `PhilosophyNew.astro:47`, `BringYourOwn.astro:63`, `BYOOption.astro:28`, `InstallSection.astro:90`, `Footer.astro:13` all use `is:global`; convert to scoped `<style>` where possible. Measure built CSS to confirm it stays under the 100 KB budget. *(Perf Med-Low)*
- [ ] **[todo] Mark capability names as `<h3>`.** `CapabilitiesSection.astro:20,40,57,67,77` use `<span class="bento-sys">` for what are effectively sub-headings. *(SEO Low)*
- [ ] **[todo] rAF-batch the `Header.astro:245` scroll listener.** Passive (good) but runs every scroll frame; wrap in `requestAnimationFrame` or toggle on threshold change only. *(CWV Low, Perf Low)*
- [ ] **[todo] Right-size the logo source asset.** `src/assets/buddy-app-icon.png` is 1.1 MB for a 32px render; replace with ~128/256px source. Shipped output is already optimized, but this speeds builds + shrinks the repo. *(Perf Low)*
- [ ] **[todo] Add `<script type="speculationrules">`** with `eagerness: "moderate"` for `/docs` to prerender the likely-next destination. *(CWV Low, Perf Low)*
- [ ] **[todo] Add `og:image:alt`** at `Landing.astro:53`. *(SEO Low)*
- [ ] **[todo] Add explicit `<meta name="robots" content="index, follow">`** at `Landing.astro:42`. *(SEO Low)*
- [ ] **[todo] Enrich the JSON-LD `image` field.** `Landing.astro:28` is a single URL string; schema.org allows an array or `ImageObject` — add an explicit logo image. *(SEO Low)*

## Dependencies
- Medium "Preload primary Geist woff2" depends on High "Self-host Geist fonts".
- The `[todo]` sub-items under each `[decide]` depend on the decision above them.
