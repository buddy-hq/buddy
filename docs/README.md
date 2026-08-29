# Docs

Single home for Buddy's documentation. One owner per concept; place new docs by the rules below.

## Layout

| Directory | What belongs here |
| --- | --- |
| `guides/` | Durable how-tos and algorithms: authoring guides, upstream-fetch, smoke tests, agent command algos (`guides/commands/`), debugging howtos (`guides/debugging/`) |
| `features/<feature>/` | Everything about one product feature: design, implementation logs, known issues, research |
| `learning/` | The learning domain: `curriculum/`, `library/`, `commons/` |
| `research/` | Research and comparisons: context-engineering, llm-wiki, notebooklm, screen sizes |
| `ops/` | Operating and shipping the app: releases, run logs, incidents, launch, site audits |
| `architecture/` | Cross-cutting system architecture: decoupling, upstream v2 audits, decision records, design notes (`architecture/design/`) |
| `reviews/` | Cross-cutting review material and known-issues snapshots |
| `archive/` | Superseded docs kept for history. Nothing new goes here; when a doc is superseded it moves here instead of being deleted |
| `artifacts/` | Working artifacts: plans, benchmarks, distilled notes |
| `memory-optimization/` | Active memory workstream (has its own AGENTS.md) |
| `skills-authoring/` | Authoring context for Buddy skills |
| `demo/` | Demo media |
| `local/`, `dogfooding/` | Personal scratch — gitignored, untracked |

## Conventions

- Filenames are kebab-case: no spaces, no uppercase.
- Known-issues live in their feature dir (`features/<f>/known-issues.md`) or in `reviews/` when cross-cutting.
- Upstream-fetch run logs go to `ops/logs/`; release-cut logs stay inside `ops/releases/logs/`.
- Never delete tracked docs — supersede them into `archive/`.

## Reorganization map (old path → new path)

| Old | New |
| --- | --- |
| `tabs/` | `features/tabs/` |
| `reader/` | `features/reader/` |
| `annotations/` | `features/annotations/` |
| `model-selector/` | `features/model-selector/` |
| `mdx/` | `features/mdx/` |
| `errors/` | `features/error-handling/` |
| `code-persona/` | `features/code-persona/` |
| `UI/chat motion and scroll.md` | `features/chat-motion/chat-motion-and-scroll.md` |
| `integrations/obsidian/` | `features/integrations/obsidian/` |
| `rfc/rfc-html-widget-print-and-pdf.md` | `features/html-widgets/rfc-html-widget-print-and-pdf.md` |
| `onboarding/design.md` | `features/onboarding/design-direction.md` |
| `curriculum/` | `learning/curriculum/` |
| `library-resources/` | `learning/library/` |
| `learning-commons/` | `learning/commons/` |
| `context-engineering/` | `research/context-engineering/` |
| `llm-wiki/` | `research/llm-wiki/` |
| `notebooklm/` | `research/notebooklm/` |
| `releases/` | `ops/releases/` |
| `logs/` | `ops/logs/` |
| `incidents/` | `ops/incidents/` |
| `launch/` | `ops/launch/` |
| `launch-video/` | `ops/launch-video/` |
| `site/audits/` | `ops/site-audits/` |
| `decoupling/` | `architecture/decoupling/` |
| `v2/` | `architecture/v2-upstream/` |
| `decisions/` | `architecture/decisions/` |
| `design/grain.md` | `architecture/design/grain.md` |
| `commands/` | `guides/commands/` |
| `session-debugging/` | `guides/debugging/` |
| `misc/known-issues.md` | `reviews/known-issues.misc.md` |
| `known-issues/state-collapsed-into-hover.md` | `reviews/state-collapsed-into-hover.md` |
| `outdated/` | `archive/` |
| `skills/buddy-skill-creator-context.md` | `skills-authoring/buddy-skill-creator-context.md` |
| `releases/upstream fetch audit.md` | `ops/releases/upstream-fetch-audit.md` |
| `guides/PROMPT-GUIDE.md` | `guides/prompt-guide.md` |
| `guides/PROMPT-PIPELINE.md` | `guides/prompt-pipeline.md` |
| `archive/Tauri Vs Context.md` | `archive/tauri-vs-context.md` |
| `artifacts/.../Sdk Migration Feasibility.md` | `artifacts/using-opencode-js-sdk/sdk-migration-feasibility.md` |
