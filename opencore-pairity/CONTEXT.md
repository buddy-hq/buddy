# OpenCore Vendoring Context

This folder now documents Buddy's direct vendoring model for OpenCode core.

## Current Intent

Buddy is no longer maintaining file-by-file parity as the primary strategy.
Instead:

1. Core infra is executed from vendored OpenCode modules.
2. Buddy source should contain thin wrappers/adapters, not duplicate core logic.
3. Buddy product behavior remains free to diverge where needed.

## What Changed

- Previous "parity drift + selective porting" workflow is retired as primary mode.
- `pairs.tsv` remains as historical/migration aid, not the long-term operating model.
- The source of truth for core behavior is vendored OpenCode code under `vendor/`.
- Legacy parity scripts remain available for audits but are not required for day-to-day delivery.

## Ongoing Risks

1. Vendor refresh risk:
   - OpenCode updates can introduce breaking behavior.
   - Mitigation: refresh vendor snapshots in controlled batches and run full Buddy test gates.

2. Adapter seam risk:
   - Thin wrappers can become accidental forks if they accumulate business logic.
   - Mitigation: keep wrappers narrow and push core behavior into vendored modules.

3. Product coupling risk:
   - Buddy routes/UI may assume previous core behavior.
   - Mitigation: validate end-to-end after each migration batch; adapt Buddy product layer explicitly.

## Decision Rule

- If code is core runtime/tool/agent-loop infra: use vendored OpenCode implementation.
- If code is Buddy-specific learning/product UX: keep it in Buddy-owned modules.
