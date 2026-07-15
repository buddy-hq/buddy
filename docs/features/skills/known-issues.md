# Skill Library Known Issues

## Disabled shallow built-in teaching skills

The following Buddy-authored skills remain in the codebase but are intentionally not packed into
the `teaching-guidance` feature:

- `learn`
- `practice`
- `assess`
- `explain`
- `worked-example`
- `compare-concepts`

These skills are too shallow to justify separate model-visible routing choices. Their triggers and
workflows overlap heavily with `teaching-models`, while `practice` and `assess` also overlap with
their dedicated feature subagents. Advertising all of them at runtime creates ambiguous skill
selection without adding enough operational guidance.

For the pre-release build, their imports and feature registrations are commented out rather than
deleting the implementations. Buddy therefore does not install, advertise, or load them through a
feature. An explicit disabled-skill allowlist preserves the repository's check against accidentally
unregistered bundled skills while excluding these known exceptions from system skill packs. They
can be redesigned later if each gains a distinct owner, routing boundary, and substantive workflow.
`teaching-models` remains the active router for concise explanation, concept contrasts, worked
examples, guided practice, and quick understanding checks. Its stale named cross-references to
`practice` and `explain` have been removed.

## Resolved

### Visible progress for curated skill actions

Resolved by tracking active library actions independently and showing a spinner plus an
operation-specific label in each affected skill button:

- `Installing...`
- `Updating...`
- `Removing...`
