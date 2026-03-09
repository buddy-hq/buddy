<agents>
  # compaction instructions: 
    DO  NOT SUMMARIZE OR COMPACT THIS PLAN
    
    Preserve this plan exactly as written. If chat context is compacted, keep this entire block verbatim and continue implementation from this block alone. Do not replace it with a summary.


</agents>
<refactorGuidelines>
# Refactoring Guidelines

This document defines how we refactor code in this repo.
The goal is to make code easier to read, reason about, change, and test without changing behavior.

## Core Standard

A good refactor has these properties:

1. Behavior is unchanged.
2. The code is easier to explain in plain language.
3. File and function ownership is obvious.
4. Control flow is explicit.
5. Hidden coupling is reduced, not increased.

If the code is still hard to reason about after the refactor, the refactor is not done.

## Design Principles

1. Prefer direct code over clever code.
2. Prefer explicit flow over indirection.
3. Prefer small focused modules over one giant file.
4. Prefer descriptive names over comments that explain bad names.
5. Prefer one responsibility per file and per function.
6. Prefer stable contracts and clear boundaries.
7. Prefer local reasoning: you should not need to open many files to understand one path.

## What To Remove

Remove these patterns aggressively:

1. Helper layers that only rename simple operations.
2. Generic abstractions used once.
3. Utility functions that hide straightforward logic.
4. Premature extension points with no real caller.
5. “Pipeline” style code that obscures ordering and state.
6. Repeated filtering/mapping chains that can be one clear pass.
7. Indirection introduced only to look “architected.”

## Preferred Refactor Shape

Use this shape by default:

1. Keep one thin entrypoint that orchestrates steps.
2. Move domain logic into focused modules by responsibility.
3. Keep shared helpers minimal and obvious.
4. Use explicit input/output types at module boundaries.
5. Keep internal helpers private unless reused.
6. Keep data transformations close to where they are used.

## Entrypoint Standard

For boundary code (for example HTTP handlers, CLI commands, tool entrypoints, workers), keep a single readable control flow by default.

Each entrypoint should show this flow inline and in order:

1. Parse/validate input.
2. Perform authorization/capability checks.
3. Call service/orchestrator.
4. Map result to boundary output.

Apply these constraints:

1. Keep boundary metadata/contracts close to handlers when they are local to that flow.
2. Keep business/domain logic outside boundary handlers in owned modules.
3. Extract shared helpers only when reused and clearly reducing noise.
4. Do not split one thin entrypoint flow into multiple files unless it clearly improves local reasoning.

## Naming Rules

1. Name by what code does, not what it might do later.
2. Use verbs for actions and nouns for data.
3. Avoid “Manager”, “Helper”, “Util”, “Core” unless truly accurate.
4. If you must explain a name in a code review comment, rename it.

## Control Flow Rules

1. Keep happy path left-aligned.
2. Use early returns to reduce nesting.
3. Keep ordering visible in code, not hidden in generic helpers.
4. Keep async orchestration explicit (`Promise.all` only when independent).
5. Keep mutation intentional and local.

## Type Rules

1. Keep public types explicit.
2. Keep domain types near domain modules.
3. Keep state contract types where state is owned.
4. Avoid type churn with broad rename-only changes unless needed.
5. Avoid `any`; use narrow unions and explicit shape types.

## Module Boundaries

1. Group code by feature ownership, not by technical novelty.
2. Keep runtime/state contracts separate from presentation/formatting logic.
3. Keep a single module entrypoint when a feature has multiple internals.
4. Keep compatibility barrels only when they reduce migration risk.
5. Delete dead paths and stale files during refactor.
6. Co-locate code that changes together; if two modules must be edited together frequently, they likely belong together.
7. Avoid dual modularization for one feature path (for example splitting one flow across two ownership areas without a clear boundary).

## Refactor Workflow

1. Map current behavior and call sites first.
2. Define target module boundaries before editing.
3. Extract/move code in small safe steps.
4. Keep existing behavior and output shape stable.
5. Update imports immediately after each move.
6. Run typecheck and relevant tests after each substantial step.
7. Remove leftovers and duplicate code at the end.

## Code Review Checklist

A refactor PR is acceptable only if all are true:

1. Behavior is unchanged and verified by tests.
2. Entrypoint flow can be understood top-to-bottom quickly.
3. Indirection was reduced, not increased.
4. Repetition was reduced without hiding logic.
5. Module boundaries are coherent and stable.
6. Public contracts are clear and minimally scoped.
7. Names are literal and require no extra explanation.
8. No dead files, dead exports, or stale compatibility shims remain.
9. Entrypoint flow is readable in one pass without hopping through thin wrapper files.
10. Entrypoint handlers visibly follow parse/validate → authorization/capability → service/orchestrator → output mapping.

## Red Flags (Reject PR)

Reject refactor PRs that do any of the following:

1. Introduce more abstraction than they remove.
2. Rename everything but improve nothing.
3. Split files without clearer ownership.
4. Add generic helpers for one-off call paths.
5. Increase cross-module hopping for basic understanding.
6. Mix behavior changes with structural cleanup without clear separation.
7. Skip tests/typecheck and claim “safe refactor.”
8. Split thin entrypoint logic across multiple files without a concrete readability win.
9. Add wrapper layers that only re-export or rename entrypoint calls.

## Practical Rule of Thumb

After refactor, a new engineer should be able to answer these in under 5 minutes:

1. Where does this flow start?
2. What are the major steps, in order?
3. Where is the state shape defined?
4. Which file owns each responsibility?
5. What can change safely without side effects?

If these answers are hard, keep refactoring.

</refactorGuidelines>
