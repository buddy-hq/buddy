# Buddy Documentation

Single home for Buddy's documentation. One canonical home per concept.

Code, configuration, tests, and `packages/buddy/src/learning/shared/teaching-vocabulary.ts` are authoritative for structure and behavior. Documentation preserves architectural rationale, decisions, product contracts, open issues, and durable procedures.

## Layout

```text
docs/
  README.md
  docs-refactor.md
  architecture/
    decisions/
      backend-dev-markdown-loader-cwd.md
      composer-accessory-vertical-budget.md
      dynamic-tools-runtime-permissions.md
      learner-memory-taxonomy-and-storage.md
      opencode-config-overlay.md
      opencode-subagent-runtime-semantics.md
      permission-v2.md
      settings-scope-architecture.md
      utility-process-backend.md
    decoupling/
      about.md
      phase-3-tool-semantics-shipped.md
      plugin-analysis.md
      tiered-decoupling-plan.md
      tool-permissions-and-migration-faq.md
      upstream-fetch-reduction-plan.md
    design/grain.md
    v2-upstream/
      buddy-opencode-v2-findings.md
      permission-v2-adoption-decision.md
      upstream-v2-audit-2026-07-04.md
  guides/
    commands/
    debugging/
    build-reader.md
    learner-memory.md
    scrollbar.md
    tool-authoring-guide.md
    upstream-fetch.algo.md
  learning/
    commons/
    skills-authoring.md
    curriculum/index.md
    curriculum/principles.md
    library/
  memory-optimization/
    AGENTS.md
    current-status.md
    exit-branch.md
    history/
  features/
    <feature>/
      # contracts, open issues, decisions, incidents
  ops/
    bug-audit/
    incidents/
    launch/
    logs/
    releases/
      logs/
    site-audits/
    launch-video/design.md
  tests/
    cleanup.md
  reviews/
    knownissues.md
    state-collapsed-into-hover.md
```

## Directory Map

| Directory | Scope |
|---|---|
| `architecture/` | System design, ADRs (`decisions/`), decoupling (`decoupling/`), upstream snapshots (`v2-upstream/`), and UI surfaces (`design/grain.md`). |
| `guides/` | Operating procedures: reader builds, memory, scrollbar, vendor sync, agent commands, debugging. |
| `learning/` | Pedagogy principles, [skill authoring](learning/skills-authoring.md), curriculum architecture. |
| `memory-optimization/` | Active memory workstream status, exit criteria, and historical recovery notes; its `AGENTS.md` governs this area. |
| `features/` | Feature contracts, design rationale, and feature-specific known issues. |
| `ops/` | Incidents, launch material, site-audit prose, releases, and durable upstream-fetch logs (`logs/`; release-cut logs stay under `releases/logs/`). |
| `tests/` | Durable test-cleanup and measurement lessons (`cleanup.md`). |
| `reviews/` | Single cross-cutting open-issue tracker (`knownissues.md`) plus the separate collapsed-hover class-of-bug audit. |

Key authorities: [dynamic tool permissions](architecture/decisions/dynamic-tools-runtime-permissions.md), [subagent runtime semantics](architecture/decisions/opencode-subagent-runtime-semantics.md), [learner memory taxonomy](architecture/decisions/learner-memory-taxonomy-and-storage.md), [settings scope](architecture/decisions/settings-scope-architecture.md), [pedagogical skill authoring](learning/skills-authoring.md), and the [docs-refactor execution record](docs-refactor.md). On-disk memory files: [learner-memory guide](guides/learner-memory.md).

## Conventions

- **Naming:** kebab-case filenames only.
- **Known issues:** Feature issues in `features/<f>/known-issues.md`; cross-cutting issues in `reviews/knownissues.md`.
- **Git is the archive:** Never keep obsolete plans, work logs, or completed checklists in active docs.
