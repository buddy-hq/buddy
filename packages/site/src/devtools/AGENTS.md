# src/devtools — Site Easel

Dev-only surface at `/devtools`. Never linked from the site, `noindex`, excluded from the
sitemap and robots.txt.

- Easel is where a prototype gets shown to the user **before** it touches real site code.
- One prototype = one `.astro` file in `src/devtools/easel/`, self-contained, scoped styles.
- Register it in `src/devtools/registry.ts` (id constant + label + subtitle) and render it in
  `src/pages/devtools/index.astro`.
- Start at the lowest fidelity that answers the open question (palette, hierarchy, sequence).
- Prototypes are throwaway. **Never write or review tests for easel work.**
