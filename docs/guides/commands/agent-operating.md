# Agent Operating Procedures

This runbook defines standard procedures for Buddy codebase agents: feature convergence (Wave 2), refactoring standards, code review guidelines, JSON output schema, and review loop execution.

---

## 1. Wave 2: Convergence Workflow

Buddy features are developed in two waves:
- **Wave 1 (Divergence / Prototype):** Rapid specification and initial prototype implementation with minimal intervention.
- **Wave 2 (Convergence / Shipping):** Refining the prototype into clean, maintainable, production-ready code.

### Wave 1 Procedure

Wave 1 intentionally produces a complete first prototype with minimal review and human intervention:

1. Brainstorm the design.
2. Write a spec document or implementation plan.
3. Break the plan into phases.
4. Broadly check what the plan covers and where it leaves gaps.
5. Ask the agent to implement the whole prototype in one coding spree / one cut.

Expect a dirty tree, including Markdown plans and phase notes. If you are seeing this procedure while converging a feature, Wave 1 is already complete; proceed to Wave 2.

### Level 1: Structural Simplification & Cleanup (Execute First)
1. **[P1] Remove Unnecessary Over-Optimizations:** Strip speculative caching, unneeded layers, and over-engineered abstractions.
2. **[P2] Refactor Data Flow:** Align data flow with established repository patterns; eliminate ad hoc APIs and duplicate fetch/state paths.
3. **[P3] Refactor UI:** Enforce Buddy design tokens and component primitives; eliminate one-off styles.

### Level 2: Bug & Regression Hunting (P0)
- **[P0] Hunt & Fix Bugs:** Fix logic defects, state races, and edge-case errors in the surviving code (after Level 1 cleanup removes code slated for deletion).

---

## 2. Refactoring Standards & Workflow

The goal is to improve clarity, maintainability, and testability without changing behavior.

### Core Standard
A refactor is complete only when:
1. Behavior is unchanged and verified by tests.
2. File and function ownership is obvious.
3. Control flow is explicit and readable top-to-bottom.
4. Indirection and hidden coupling are reduced.

### Principles & Patterns
- **Direct over clever:** Prefer explicit, readable flow over generic indirection.
- **Left-aligned happy path:** Use early returns to minimize nesting.
- **Module size:** Group by responsibility; do not split code that belongs together purely for arbitrary line-count limits.
- **Thin entrypoints:** Visually orchestrate: `parse/validate` → `authorize/capability check` → `service/execute` → `map output`.
- **Literal naming:** Name by current function, not speculative future use. Avoid vague suffixes (`Manager`, `Helper`, `Util`, `Core`).
- **Remove anti-patterns:** Strip single-use generic abstractions, thin wrapper layers that only rename calls, and premature extension points.

### Refactor Cycle: Do → Review → Fix
Repeat until clean:
1. **Do:** Plan target structure, move files (`git mv`), update imports, and isolate logic boundaries.
2. **Review & Verification:**
   - Verify imports, typecheck, and lint pass with zero dangling references.
   - For file/logic splits, verify behavioral preservation: compare `git show HEAD:<path>` against reconstructed split modules (constants, functions, types, and hooks must match).
   - Verify UI component trees, styling tokens, and Tailwind classes remain identical.
3. **Fix:** Resolve specific discrepancies before proceeding.

### Preferred Refactor Shape

Use this shape by default:

1. Keep one thin entrypoint that orchestrates the steps.
2. Move domain logic into focused modules by responsibility.
3. Keep shared helpers minimal and obvious.
4. Use explicit input/output types at module boundaries.
5. Keep internal helpers private unless reused.

### Control Flow Rules

1. Keep the happy path left-aligned.
2. Use early returns to reduce nesting.
3. Keep ordering visible in code, not hidden in generic helpers.
4. Use `Promise.all` only for genuinely independent operations; keep async orchestration explicit.
5. Keep mutation intentional and local.

### Refactor Red Flags

Reject refactors that do any of the following:

1. Introduce more abstraction than they remove.
2. Rename everything but improve nothing.
3. Split files without clearer ownership.
4. Add generic helpers for one-off call paths.
5. Increase cross-module hopping for basic understanding.
6. Mix behavior changes with structural cleanup without clear separation.
7. Skip tests or typecheck and claim a refactor is safe.
8. Split thin entrypoint logic without a concrete readability win.
9. Add wrappers that only re-export or rename entrypoint calls.

### Refactor Review Checklist

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

### 5-Minute Rule of Thumb
After a refactor, an engineer should be able to answer in under 5 minutes:
1. Where does this flow start?
2. What are the major steps in order?
3. Where is state shape defined?
4. Which file owns each responsibility?
5. What can change safely without side effects?

---

## 3. Code Review Guidelines & Schema

Identify discrete, actionable bugs impacting accuracy, performance, security, or maintainability.

### Bug Criteria
- **Flag:** Discrete bugs introduced by the commit, provable disruptions to other components, security risks, performance regressions, or repository standard violations.
- **Do not flag:** Pre-existing issues, speculative unproven disruptions, intentional changes, or subjective stylistic preferences.

### Comment Rules
- Keep comments brief (one paragraph max) and actionable.
- For replacement code, use ` ```suggestion ` blocks with exact matching indentation (maximum 3 lines).
- Scope line ranges tightly to the defect (5–10 lines maximum).

### Priority Levels
- `[P0]` (Priority `0`): **Blocking.** Release/operational blocker or critical data loss.
- `[P1]` (Priority `1`): **Urgent.** Must be addressed in next cycle.
- `[P2]` (Priority `2`): **Normal.** To be fixed eventually.
- `[P3]` (Priority `3`): **Low / Nit.** Minor improvement or nice-to-have.

### Review Output Schema
```json
{
  "findings": [
    {
      "title": "<≤ 80 chars, imperative, e.g. [P1] Correct bounds check in pagination>",
      "body": "<valid Markdown explaining why this is a problem; cite files/lines/functions>",
      "confidence_score": 0.95,
      "priority": 1,
      "code_location": {
        "absolute_file_path": "/path/to/file.ts",
        "line_range": { "start": 42, "end": 48 }
      }
    }
  ],
  "overall_correctness": "patch is correct",
  "overall_explanation": "<1-3 sentence explanation justifying the overall verdict>",
  "overall_confidence_score": 0.95
}
```

---

## 4. Review Loop Execution

Iterative review and patching process:

### Execution Modes
1. **Sub-Agentic Mode (Default):**
   - **Phase 1 (Self-Review):** Review the diff against review guidelines and patch qualifying findings.
   - **Phase 2 (Sub-Agent Loop):** Dispatch review subagent with verbatim review instructions and spec artifacts. Verify findings (filter hallucinations), patch verified issues, and repeat until no significant findings (P0–P2) remain.
2. **Self-Only Mode:**
   - Perform iterative self-review passes and patch findings until clean.

### Auto-Patching Permissions
- **Allow (Default):** Directly apply patches for confirmed findings.
- **Ask:** Propose fixes and request user confirmation before applying.

### Termination Criteria
Stop when no findings remain, or when remaining items are purely cosmetic/stylistic nits (P3).
