# SEO audit — packages/site (revalidated)

**Method (durable):** Check canonical, OG/Twitter, JSON-LD types, sitemap/robots, heading outline, internal links. Original EducationalOrganization recommendation was **never** in the source audit; do not add it unless product asks for that schema.

**Target 2026-08-30:** `SeoHead.astro` (used by `layouts/Landing.astro`), `content/site.ts`, `pages/index.astro` (learner landing).

## Current (implemented)

- Self-referencing canonical from `Astro.url.pathname` + `meta.siteUrl`.
- Complete Open Graph + Twitter card set; `twitter:site` and `twitter:creator` are `@hibuddyai`.
- JSON-LD `@graph`: `SoftwareApplication` (with `Offer.availability` + `Offer.url`), `Organization` (`sameAs` from `meta.organizationSameAs`), `WebSite`, `WebPage`.
- `robots` meta from layout props; sitemap/robots still owned by the Astro sitemap integration (confirm `astro.config` if changing domains).
- Single learner `<h1>` on `/` via `LearnerHero.astro`. Feature steps use a `<section>` (`FeatureSteps.astro`); narrative is a `<p>`, not an `<h2>`.

## Remaining

- Feature-steps heading outline is still visually a card stack without a section `<h2>` unless `narrative` is treated as the heading (it is a styled paragraph). Product choice, not a missing JSON-LD type.
- Internal linking beyond the landing CTAs was a prior gap; re-check Header/Footer against `/docs` when that route ships.

## Dated

- Triple-`<h1>` from two audience heroes plus a mock article title applied to an older combined landing. Current `/` is learner-only.
- `Landing.astro:20–34` JSON-LD cites — implementation moved to `SeoHead.astro`.
