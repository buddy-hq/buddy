# Notes For `refer-opencode`

## Current Decision Model

Buddy uses vendored OpenCode core as runtime authority for core infra.
Buddy keeps product-specific behavior in Buddy-owned modules.

Default:

- core-runtime => execute via vendored OpenCode modules
- buddy-product => intentional Buddy-owned behavior, documented

## Where Dynamic Context Lives

- `opencore-pairity/CONTEXT.md` for intent/risk context
- `opencore-pairity/sync-checklist.md` for current process
- `opencore-pairity/sync-log.md` for recent decisions and outcomes

Do not duplicate those changing details in this file.

Legacy mapping files (`pairs.tsv`, `test-pairs.tsv`) remain for historical/migration context.

## When To Use OpenCode Notes Directory

OpenCode notes (`../opencode/notes/**`) are useful for orientation, but must be validated against live code.

Read notes only when needed for:

- architecture background (`notes/agent-loop-*`, `notes/event-*`)
- context/storage background (`notes/context-*`, `notes/message-*`)
- prior Buddy-specific architecture decisions (`notes/buddy/*`)

Do not treat notes as implementation source of truth.

## Practical Rule

Before recommending architecture:

1. read Buddy live code
2. read vendored OpenCode counterpart in `vendor/opencode-core`
3. run vendoring workflow from `opencore-pairity/sync-checklist.md` when task touches core-runtime
4. then propose porting/fork/divergence decision
