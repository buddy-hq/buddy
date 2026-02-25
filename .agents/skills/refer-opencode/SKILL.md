---
name: refer-opencode
description: Use vendored OpenCode core as Buddy's runtime authority, with Buddy-specific behavior layered through thin adapters.
---

## Purpose

Use OpenCode as the primary implementation source for Buddy core infra while preserving Buddy-specific learning product behavior.

This skill is intentionally stable. Do not duplicate frequently changing state here.
Operational state belongs in `opencore-pairity/`.

### Stack Alignment

| Component | OpenCode | Buddy (Current) |
| --- | --- | --- |
| Backend runtime | Bun + Hono | Bun + Hono facade over vendored OpenCode |
| Frontend | SolidJS | React + Vite |
| Database | SQLite (Drizzle) | Shared SQLite runtime path via vendored core |
| Transport | HTTP + SSE | HTTP + SSE |
| LLM/runtime loop | OpenCode core | Vendored OpenCode core |

## Repository Paths

- Buddy: current repo
- Vendored core: `vendor/opencode-*`
- Upstream OpenCode: `~/code/opencode` (fallback `~/Code/opencode`)

## Source Of Truth

1. Live Buddy code
2. Vendored OpenCode code under `vendor/`
3. Vendoring runbook in `opencore-pairity/`

## Operating Model

Before implementing, classify work as:

1. `core-runtime`: session loop, tool execution, provider plumbing, permission engine, SSE/runtime behavior.
2. `buddy-product`: curriculum, learning UX, compatibility response shaping, web interaction details.

Rules:

- For `core-runtime`: execute behavior from vendored OpenCode modules; keep Buddy wrappers thin.
- For `buddy-product`: keep Buddy-owned behavior in Buddy modules.
- If uncertain, default to `core-runtime` and verify whether behavior already exists in vendored core.

## Vendoring Workflow Entry Point

When task touches `core-runtime`, use these files directly:

- `opencore-pairity/README.md`
- `opencore-pairity/sync-checklist.md`
- `opencore-pairity/CONTEXT.md`
- `opencore-pairity/sync-log.md`

Legacy parity mapping files (`pairs.tsv`, `test-pairs.tsv`) are historical/reference material, not the primary operating workflow.

## References

For detailed information, see:

- **[FILES.md](references/FILES.md)** - where to read current runtime/vendoring sources
- **[PATTERNS.md](references/PATTERNS.md)** - implementation patterns for vendored-core + adapter seams
- **[NOTES.md](references/NOTES.md)** - decision model and risk framing
- **[STYLE.md](references/STYLE.md)** - practical porting/editing style
