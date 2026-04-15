# Buddy Persona Authoring Guide

This guide is retained only as a historical pointer.

The current persona authoring flow is documented in:

- `docs/guides/persona-authoring-guide-v2.md`

The previous instructions in this file described an older split model where persona policy lived in `registry.ts`, persona runtime lived in `agent.ts`, and persona registration required manual edits in `register-agents.ts` and frontend fallback lists.

That is no longer the intended authoring path.

Use the v2 guide for the current single-definition model:

- each persona is authored once in `packages/buddy/src/learning/personas/<persona-id>/agent.ts`
- shared persona catalogs and runtime agents are derived from those definitions
- config schema and persona ids are derived automatically
- frontend default selection uses backend catalog order instead of a hardcoded persona list
