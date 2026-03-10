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
3. Prefer small focused modules over one giant file. But never split code that belongs together in the same file just because it's large.
4. Prefer descriptive names over comments that explain bad names.
5. Prefer stable contracts and clear boundaries.
6. Prefer local reasoning: you should not need to open many files to understand one path.

## What To Remove

Remove these patterns aggressively:

1. Helper layers that only rename simple operations.
2. Generic abstractions used once.
3. Utility functions that hide straightforward logic.
4. Premature extension points with no real caller.
5. Repeated filtering/mapping chains that can be one clear pass.
6. Indirection introduced only to look “architected.”

## Preferred Refactor Shape

Use this shape by default:

1. Keep one thin entrypoint that orchestrates steps.
2. Move domain logic into focused modules by responsibility.
3. Keep shared helpers minimal and obvious.
4. Use explicit input/output types at module boundaries.
5. Keep internal helpers private unless reused.


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




## Code Review Checklist

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

## Red Flags

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
