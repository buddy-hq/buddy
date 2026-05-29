# AGENTS.md

## UI design Guidelines
- wherever possible use index.css theme colors defined in the ui package.
- avoid using hardcoded colors or var(--x) format
- prefer using shared `@buddy/ui` components (Buddy extensions built on shadcn primitives) instead of inventing your own components
  - invent only when none of the components fit perfectly for the job.
- avoid using js styles, unless you want to do something tailwind can't do
