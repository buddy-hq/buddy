# Buddy Spec Index

Use these documents in this order:

1. [buddy-core.spec.md](/Users/prashantbhudwal/Code/buddy/buddy-core.spec.md)
   The canonical implementation spec for Buddy core.
2. [buddy-core-coverage.md](/Users/prashantbhudwal/Code/buddy/docs/spec/buddy-core-coverage.md)
   Section-by-section coverage matrix for the current shipped implementation.
3. [buddy-user-guide.md](/Users/prashantbhudwal/Code/buddy/docs/buddy-user-guide.md)
   Product-facing explanation of how to use Buddy well.
4. [docs/sources/curriculum/principles.md](/Users/prashantbhudwal/Code/buddy/docs/sources/curriculum/principles.md)
   Source-backed pedagogy principles Buddy is built around.
5. [docs/sources/curriculum/crosswalk.md](/Users/prashantbhudwal/Code/buddy/docs/sources/curriculum/crosswalk.md)
   Mapping from pedagogy sources to intent docs, spec, prompts, and runtime behavior.

## Current product model

- notebooks are neutral workspaces
- learner knowledge lives in the cross-notebook learner store
- workspace-local state is limited to `.buddy/context.json` and teaching artifacts
- the right sidebar shows a generated Learning Plan, not an editable curriculum file
- the main teaching controls are `persona`, `Understand | Practice | Check`, and `Auto`

## Notes

- Internal route/type identifiers may still use `curriculum` for compatibility inside Buddy.
- User-facing product language should prefer `Learning Plan`.
