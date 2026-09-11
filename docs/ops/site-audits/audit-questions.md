# Landing page audit — remaining product questions

Revalidated 2026-08-30. Earlier unanswered infra questions that now have code answers are recorded here so this file is not a live questionnaire.

## Settled in current sources

| Question | Current answer |
|---|---|
| Primary page `<h1>` | Learner landing (`index.astro` → `LearnerHero.astro`). Educator hero is a separate landing, not a second `<h1>` on `/`. |
| Title / description | `content/site.ts` learner SEO fields, passed into `layouts/Landing.astro` → `SeoHead.astro`. |
| Twitter handles | `meta.twitterHandle` = `@hibuddyai` on site and creator tags. |
| Organization `sameAs` | `https://x.com/hibuddyai`, YouTube `@hibuddyin`, LinkedIn company URL in `content/site.ts`. |
| Analytics | PostHog capture endpoint + project token in `Landing.astro` (layout), not a Google Fonts / third-party tag manager. |
| JSON-LD types | `SoftwareApplication` and `Organization` (not EducationalOrganization). |

## Still open

- Hero mock animation: gate-only vs visual simplify for INP (see `core-web-vitals-audit.md`).
- Hosting/DNS/domain ops: not encoded in these sources; keep in launch/ops, not as stale `Landing.astro` line questions.
