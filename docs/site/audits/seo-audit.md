# SEO Audit — packages/site landing page

## Summary

The Buddy landing page (`packages/site/src/pages/index.astro`) has a solid SEO foundation: a self-referencing canonical URL, a complete Open Graph + Twitter Card set, a valid `SoftwareApplication` JSON-LD block, an `@astrojs/sitemap` integration, a `robots.txt` that references the sitemap index, a responsive viewport, and an explicit `lang="en"` attribute. The page is prerendered (`export const prerender = true`), which is good for crawlability and Core Web Vitals.

The most significant issues are around **headings**: the page renders **three `<h1>` elements** in the DOM (two audience-swap hero headlines plus a mockup article title), and the `FeatureSteps` section jumps straight to `<h3>` with no section `<h2>` because the `featuresHeader` content is imported but never rendered. Beyond that, the title and meta description are shorter than the skill recommends, the Twitter card lacks a site/creator handle, the JSON-LD `Offer` is missing `availability`/`url`, several content sections use generic `<div>` wrappers instead of `<section>`, and the page has essentially no descriptive internal links (the only anchor is `href="#"` on the logo, and there is no link to `/docs`).

## Findings

### Meta

- **Medium — Title tag is shorter than recommended.**
  <ref_snippet file="packages/site/src/layouts/Landing.astro" line="43">
  `<title>{title}</title>`
  </ref_snippet>
  The default title is `"Buddy - The Learning Superapp"` (`packages/site/src/content/site.ts:235`), which is ~29 characters. The skill recommends 50–60 characters with the primary keyword near the beginning. There is room to add keyword-rich descriptor (e.g. "Buddy — Private, Local-First AI Learning Assistant for Students & Teachers").

- **Medium — Meta description is shorter than recommended.**
  <ref_snippet file="packages/site/src/content/site.ts" line="236">
  `defaultDescription: "A private, local-first desktop learning assistant for students, lifelong learners, and educators.",`
  </ref_snippet>
  This is ~95 characters. The skill recommends 150–160 characters with a compelling call-to-action. The current description is accurate but under-utilizes the available snippet length.

- **Low — No explicit `<meta name="robots">` tag.**
  `Landing.astro` does not emit a robots meta tag. The page is indexable by default, so this is not a bug, but the skill’s checklist lists an explicit robots directive as good practice. Adding `<meta name="robots" content="index, follow">` is a harmless explicit signal.

### OG + Twitter

- **Medium — Twitter card missing `twitter:site` / `twitter:creator`.**
  <ref_snippet file="packages/site/src/layouts/Landing.astro" line="58">
  `<meta name="twitter:card" content="summary_large_image" />`
  </ref_snippet>
  Lines 58–61 define card/title/description/image, but there is no `twitter:site` (@handle) or `twitter:creator`. If Buddy has a Twitter/X handle, add it so the card is attributed correctly.

- **Low — No `og:image:alt`.**
  `Landing.astro:53` sets `og:image` but no `og:image:alt`. Adding a short alt improves accessibility of the social card and is a low-cost addition.

### Structured data

- **Medium — `Offer` in JSON-LD is incomplete.**
  <ref_snippet file="packages/site/src/layouts/Landing.astro" line="29">
  ```
  offers: {
    "@type": "Offer",
    price: meta.jsonLd.price,
    priceCurrency: meta.jsonLd.priceCurrency,
  },
  ```
  </ref_snippet>
  The skill’s `Product` example includes `availability` and `url` on the offer. For `SoftwareApplication` the same fields help rich results. Add `"availability": "https://schema.org/InStock"` and `"url": meta.siteUrl`.

- **Low — No `Organization` structured data.**
  Only `SoftwareApplication` is emitted (`Landing.astro:20–34`). The skill recommends an `Organization` block (name, url, logo, sameAs) for the site/homepage. Adding one would help knowledge-panel and AI-search attribution.

- **Low — `image` field is a single URL string.**
  `Landing.astro:28` sets `image: ogImage`. schema.org allows an array or an `ImageObject`; a single URL is valid, but providing an explicit logo image in addition to the OG image improves richness.

### Sitemap

- **Pass (no findings).** `astro.config.mjs:51` registers `sitemap()` and `site: "https://hibuddy.in"` is set on line 30, so `@astrojs/sitemap` will generate `sitemap-index.xml` at the correct URL. `robots.txt:4` references `https://hibuddy.in/sitemap-index.xml`, matching the integration output.

### robots

- **Pass (no findings).** `public/robots.txt` allows all user agents and references the sitemap. No resources needed for rendering are blocked. (Note: there is no `Disallow` for `/docs` or private areas, but none are required for the landing page audit.)

### Semantic HTML

- **Medium — Several major content sections are `<div>` instead of `<section>`.**
  - `PhilosophyNew.astro:10` — `<div class="philosophy-new">`
  - `CapabilitiesSection.astro:6` — `<div class="capabilities-section">`
  - `BringYourOwn.astro:13` — `<div class="bring-your-own">`
  Each is a distinct thematic content block with its own heading. Using `<section>` (with an `aria-label` or labelled by its heading) improves landmark semantics and assistive-tech navigation. `Hero.astro:6`, `FeatureSteps.astro:21`, and `InstallSection.astro:8` already use `<section>` correctly.

- **Low — Only internal anchor is `href="#"`.**
  <ref_snippet file="packages/site/src/components/Header.astro" line="11">
  `<a href="#" class="logo-group">`
  </ref_snippet>
  The logo link points to `#`, which the smooth-scroll script (`Landing.astro:78–88`) intercepts to scroll to top. This is not a real internal link. The skill recommends descriptive internal links to relevant pages; the site has a `/docs` route (Starlight) that is not linked from the landing page at all.

### Headings

- **High — Multiple `<h1>` elements on the page.**
  <ref_snippet file="packages/site/src/components/Hero.astro" line="13">
  `<h1 class="hero-title">` (learners)
  </ref_snippet>
  <ref_snippet file="packages/site/src/components/Hero.astro" line="24">
  `<h1 class="hero-title">` (educators)
  </ref_snippet>
  Both hero headlines are `<h1>` and both are present in the rendered DOM (the audience swap is a CSS visibility toggle, not conditional rendering). The skill states “Single `<h1>` per page.” Additionally, the reader mockup renders a third `<h1>`:
  <ref_snippet file="packages/site/src/components/features/mocks/LearnerReadMock.astro" line="57">
  `<h1 class="article-title">Self-Reliance</h1>`
  </ref_snippet>
  This mockup `<h1>` competes with the page’s real `<h1>` for the “main topic” signal. Recommendation: keep one `<h1>` for the primary audience headline, make the alternate audience headline an `<h2>` (or render only one via SSR), and demote the mockup article title to `<h2>` or `<p>` since it is illustrative content inside a product screenshot.

- **High — `FeatureSteps` section skips the `<h2>` level.**
  <ref_snippet file="packages/site/src/components/features/FeatureSteps.astro" line="17">
  `const learnersHeader = content.learners.featuresHeader`
  </ref_snippet>
  `learnersHeader`/`educatorsHeader` (which contain `headline` and `subtext`) are imported but **never rendered** in the template. The section therefore goes directly from the page `<h1>` to `<h3 class="step-title">` (lines 41, 47) with no section `<h2>`. This skips a heading level and removes the section’s descriptive heading from the document outline. Render `featuresHeader.headline` as an `<h2>` at the top of the section.

- **Low — Capability item names are `<span>`, not headings.**
  <ref_snippet file="packages/site/src/components/CapabilitiesSection.astro" line="20">
  `<span class="bento-sys">{capabilities.items[0].name}</span>`
  </ref_snippet>
  The section has an `<h2>` (line 9) but each capability card’s name is a styled `<span>`. These are effectively sub-headings; marking them as `<h3>` would give the document outline more structure and let search engines/AI summarizers extract the capability list.

### Images

- **Low — `<img>` in mockup lacks explicit `width`/`height`.**
  <ref_snippet file="packages/site/src/components/features/mocks/LearnerReadMock.astro" line="23">
  `<img src="/self-reliance.webp" alt="Self Reliance by Ralph Waldo Emerson" class="cover-img" />`
  </ref_snippet>
  Alt text is present and descriptive (good), but no `width`/`height` attributes are set. The skill’s image guidelines recommend explicit dimensions to prevent layout shift and to satisfy the SEO image checklist. (The same image is referenced again via JS-injected HTML in `BuddyWorkspaceMock.astro` script data without dimensions.)

- **Pass — Logo image has alt text.** `Header.astro:12` uses `alt={`${headerContent.brandName} Logo`}` via `astro:assets` `<Image>`, which also handles dimensions/optimization.

### Other

- **Low — `html lang` is set, but no hreflang.** `Landing.astro:38` sets `<html lang="en">`, satisfying the language-declaration guideline. Hreflang is not applicable (single-language site), so no action needed.

- **Low — Title uniqueness across pages not verifiable from this audit.** Only `index.astro` was reviewed. The layout defaults title/description from `meta` (`Landing.astro:13–15`); other routes should override `title`/`description` to keep them unique.

## Passes

- **Canonical URL is self-referencing and correct.** `Landing.astro:17,45` builds `canonicalURL` from `Astro.url.pathname` and `meta.siteUrl` (`https://hibuddy.in`) and emits `<link rel="canonical">`.
- **Open Graph set is complete.** `Landing.astro:49–56` includes `og:type`, `og:title`, `og:description`, `og:url`, `og:image`, `og:image:width`, `og:image:height`, and `og:site_name`.
- **Twitter Card uses `summary_large_image`.** `Landing.astro:58–61` with matching title/description/image.
- **JSON-LD `SoftwareApplication` is present and mostly valid.** `Landing.astro:20–34` with `@context`, `@type`, name, category, OS, description, url, image, and a free-price `Offer`.
- **Sitemap integration is configured.** `astro.config.mjs:30,51` sets `site` and registers `@astrojs/sitemap`.
- **`robots.txt` is correct and references the sitemap.** `public/robots.txt:1–4`.
- **Responsive viewport is set.** `Landing.astro:41` — `width=device-width, initial-scale=1.0`.
- **Language is declared.** `Landing.astro:38` — `<html lang="en">`.
- **Page is prerendered.** `index.astro:12` — `export const prerender = true`, serving static HTML for crawlers.
- **Semantic landmarks exist.** `index.astro:17` uses `<main>`; `Header.astro:9` uses `<header>`; `Footer.astro:7` uses `<footer>`; hero/features/install use `<section>`.
- **Heading hierarchy is logical where sections have headings.** Philosophy (`h2` → `h3`), Capabilities (`h2`), BringYourOwn (`h2` → `h3`), Install (`h2` → modal `h3`) all follow a correct order.
- **Logo image alt text is descriptive.** `Header.astro:12`.
- **HTTPS is used consistently.** `meta.siteUrl` is `https://hibuddy.in`; OG/Twitter/JSON-LD image URLs derive from it.
- **Favicon and apple-touch-icon are linked.** `Landing.astro:46–47`.

## Recommendations (prioritized)

1. **High — Fix the multiple `<h1>` issue.**
   - `Hero.astro:13` and `Hero.astro:24`: keep one `<h1>` (e.g. the learners headline) and change the other to `<h2>`, or render only the active audience’s headline server-side.
   - `LearnerReadMock.astro:57`: change `<h1 class="article-title">` to `<h2>` or `<p>` — it is content inside a product mockup, not the page’s main topic.

2. **High — Add the missing section `<h2>` in `FeatureSteps`.**
   - `FeatureSteps.astro`: render `learnersHeader.headline` / `educatorsHeader.headline` (already imported on lines 17–18 but unused) as an `<h2 class="section-title">` inside the appropriate audience swap block, before the `<h3 class="step-title">` cards. This restores the h1 → h2 → h3 hierarchy.

3. **Medium — Lengthen the title and meta description.**
   - `site.ts:235`: expand `defaultTitle` toward ~55 characters with primary keywords (e.g. "Buddy — Private Local-First AI Learning Assistant").
   - `site.ts:236`: expand `defaultDescription` toward ~155 characters with a call-to-action.

4. **Medium — Complete the JSON-LD `Offer`.**
   - `Landing.astro:29–33`: add `"availability": "https://schema.org/InStock"` and `"url": meta.siteUrl` to the `offers` object. Optionally add an `Organization` block alongside `SoftwareApplication`.

5. **Medium — Add `twitter:site` (and `twitter:creator` if applicable).**
   - `Landing.astro:58`: add `<meta name="twitter:site" content="@buddy" />` (replace with the real handle) after the twitter card meta.

6. **Medium — Convert content `<div>` sections to `<section>`.**
   - `PhilosophyNew.astro:10`, `CapabilitiesSection.astro:6`, `BringYourOwn.astro:13`: change the wrapper `<div>` to `<section>` and add `aria-labelledby` pointing at the section’s heading id (add `id` to the existing `<h2>`).

7. **Medium — Add a real internal link to `/docs`.**
   - `Header.astro` or `Footer.astro`: add a descriptive anchor (e.g. "Read the Buddy docs") linking to `/docs`, and change the logo `href="#"` (`Header.astro:11`) to `/` so it is a genuine homepage link rather than a hash.

8. **Low — Mark capability names as headings.**
   - `CapabilitiesSection.astro:20,40,57,67,77`: change `<span class="bento-sys">` to `<h3 class="bento-sys">` so the capability list appears in the document outline.

9. **Low — Add explicit image dimensions.**
   - `LearnerReadMock.astro:23`: add `width` and `height` attributes to the `<img>` (or switch to `astro:assets` `<Image>`).

10. **Low — Add `og:image:alt` and an explicit `<meta name="robots" content="index, follow">`.**
    - `Landing.astro:53` and `Landing.astro:42` respectively.
