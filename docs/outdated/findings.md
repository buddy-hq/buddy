# Code Review – Uncommitted Changes

> [!NOTE]
> This is a read-only review. No changes were made. Findings are ranked roughly by severity.

---

## 🔴 Critical / Bugs

### 1. `latestTimestamp()` mutates its input array via `.sort()`

**File:** [projections.ts](file:///Users/prashantbhudwal/Code/buddy/packages/buddy/src/learning/learner/projections.ts#L13-L15)

```typescript
function latestTimestamp(values: string[]): string | undefined {
  return values.sort((left, right) => right.localeCompare(left))[0]
}
```

`.sort()` sorts **in-place**, meaning every caller's input array is silently reordered. This function is called with `.map()` output (safe), but the pattern is fragile — any future caller passing a stored array will get unexpected mutation. Should use `[...values].sort(...)` or `Math.max`-style reduce.

---

### 2. Evidence append-file has no concurrency guard — race condition

**File:** [store.ts](file:///Users/prashantbhudwal/Code/buddy/packages/buddy/src/learning/learner/store.ts#L91-L95)

```typescript
async function appendEvidenceLine(record: EvidenceRecord) {
  const filepath = LearnerPath.evidenceLog()
  await ensureParent(filepath)
  await fs.appendFile(filepath, `${JSON.stringify(record)}\n`, 'utf8')
}
```

`fs.appendFile` is _not_ atomic on all platforms. If two concurrent requests both call `appendEvidence` (e.g. during rapid message sending), you can get interleaved partial writes creating corrupted JSON lines. The other JSON files use the safer `write → rename` pattern, but the evidence log does not. At minimum, a lock (or buffered queue) should protect this path.

---

### 3. In-memory session state has no eviction — unbounded memory leak

**File:** [session-state.ts](file:///Users/prashantbhudwal/Code/buddy/packages/buddy/src/learning/learner/../runtime/session-state.ts#L5)

```typescript
const runtimeState = new Map<string, TeachingSessionState>()
```

Entries are added on every prompt via `writeTeachingSessionState` but **never removed**. Over a long-running process with many sessions, this `Map` grows without bound. Needs an LRU cache or a TTL-based eviction strategy.

---

### 4. Large binary files staged for commit — repo bloat

The diff includes **two 271K-line JavaScript bundles**, **two WASM files**, and a **125 MB `.exe` sidecar**:

| File                                                              | Size          |
| ----------------------------------------------------------------- | ------------- |
| `packages/desktop/src-tauri/resources/backend/buddy-backend.js`   | 271,285 lines |
| `packages/desktop/src-tauri/resources/backend/index.js`           | 271,285 lines |
| `packages/desktop/src-tauri/resources/backend/tree-sitter-*.wasm` | ~1.5 MB       |
| `packages/desktop/src-tauri/sidecars/buddy-backend.exe`           | 125 MB        |

The `.gitignore` only ignores `packages/desktop/src-tauri/sidecars/buddy-backend` (without `.exe`), so the `.exe` file is **not gitignored** and is staged. The JS bundles and WASM files are also fully staged. Committing these will be extremely heavy on the repo. These should be in `.gitignore` and handled via CI artifacts / releases.

---

## 🟡 Moderate Issues

### 5. `runSafetySweep` re-reads feedback independently from `readState`, creating a stale-data window

**File:** [service.ts](file:///Users/prashantbhudwal/Code/buddy/packages/buddy/src/learning/learner/service.ts#L994-L1033)

```typescript
export async function runSafetySweep() {
  const state = await readState() // reads feedback at time T₁
  const feedback = await LearnerStore.readFeedback() // reads feedback AGAIN at time T₂
  // ... mutates feedback.records ...
  await LearnerStore.writeFeedback(feedback.records) // writes T₂ version, potentially missing T₁→T₂ changes
}
```

`readState()` already loads feedback, but a _second_ read of feedback is done independently. If another write happened between T₁ and T₂, the sweep could clobber it. The feedback data from `state` should be reused instead.

---

### 6. `scaffoldingForPracticeOutcome` has a misleading `difficulty` parameter type

**File:** [feedback.ts](file:///Users/prashantbhudwal/Code/buddy/packages/buddy/src/learning/learner/feedback.ts#L19-L22)

```typescript
function scaffoldingForPracticeOutcome(
  outcome: PracticeAttempt["outcome"],
  difficulty?: PracticeAttempt["outcome"] | "scaffolded" | "moderate" | "stretch",
): ScaffoldingLevel {
```

The `difficulty` parameter is typed as `PracticeAttempt["outcome"] | "scaffolded" | "moderate" | "stretch"`. The `PracticeAttempt["outcome"]` part (`"assigned" | "partial" | "completed" | "stuck"`)
makes no sense as a difficulty value. The only values checked are `"stretch"`, so this is dead type surface that will confuse future developers. Should be `"scaffolded" | "moderate" | "stretch" | undefined`.

---

### 7. `updateWorkspaceContext` silently ignores falsy `label` or `tags` patches

**File:** [service.ts](file:///Users/prashantbhudwal/Code/buddy/packages/buddy/src/learning/learner/service.ts#L326-L338)

```typescript
...(patch.label ? { label: normalizeText(patch.label) } : {}),
...(patch.tags ? { tags: normalizeList(patch.tags.map(...)) } : {}),
```

If a caller passes `patch.label = ""` or `patch.tags = []`, the spread is `{}` (no-op) because these are falsy. This means you **cannot clear** a label to empty string or reset tags to an empty array through this API. This is likely a bug for the `tags` case at minimum.

---

### 8. Prompt injection decision skips re-injection when content changes identically

**File:** [prompt-injection.ts](file:///Users/prashantbhudwal/Code/buddy/packages/buddy/src/learning/learner/../runtime/prompt-injection.ts#L23-L24)

```typescript
injectStableHeader: stableHeader.length > 0 && stableHeader !== previousStableHeader,
injectTurnContext: turnContext.length > 0 && turnContext !== previousTurnContext,
```

If the learner state hasn't changed between turns, the stable header will **not** be re-injected into the system prompt. This is by design for optimization, but if the LLM context window is reset (e.g., session reload), the stable header will be missing entirely on the next turn. There's no "force re-inject on first turn" logic.

---

## 🟢 Minor / Style Issues

### 9. Duplicate `SKILL.md` files across packages

The exact same 12 SKILL.md files are duplicated in both:

- `packages/buddy/src/skills/system/`
- `packages/desktop/src-tauri/resources/backend/skills/system/`

These will inevitably drift out of sync. Consider a build step that copies them from one canonical location.

---

### 10. `readState()` always reads all files — no lazy loading

**File:** [service.ts](file:///Users/prashantbhudwal/Code/buddy/packages/buddy/src/learning/learner/service.ts#L370-L416)

`readState()` does 12 parallel file reads every time it's called (meta, goals, edges, evidence, practice, assessments, misconceptions, constraints, feedback, + 3 projections). Several callers (like `queryForPrompt`, `getCurriculumView`, `getSessionPlan`) call `readState()` and then only use a subset of the returned data. As the learner store grows, this will become a performance bottleneck, especially for the evidence log which is a JSONL append-only file that must be parsed line by line.

---

### 11. `inferLearnerMessageSignals` uses simple regex — high false-positive risk

**File:** [service.ts](file:///Users/prashantbhudwal/Code/buddy/packages/buddy/src/learning/learner/service.ts#L98-L112)

Word boundaries like `\b(explain|what is|why|...)\b` will fire on many normal sentences. For example, "I want to understand **why** React uses virtual DOM" would trigger `requestedExplanation` even if the learner is just providing context, not requesting an explanation. The `completionClaim` regex `^(done|finished|...)` is anchored at start, which is better but still fragile. Not necessarily a bug, but worth acknowledging as a known-noisy heuristic.

---

### 12. `buildSessionPlan` can crash if `scopedGoals` is empty but `activeGoals` is non-empty

**File:** [sequencing.ts](file:///Users/prashantbhudwal/Code/buddy/packages/buddy/src/learning/learner/sequencing.ts#L252-L254)

```typescript
const primary = ranked[0] ?? {
  goal: scopedGoals[0] ?? activeGoals[0],
  ...
}
```

If `focusGoalIds` is non-empty but none of them match actual goals, `scopedGoals` will be empty and `candidateGoals` will also be empty. The fallback accesses `scopedGoals[0]` (undefined), then `activeGoals[0]` (defined), which works. But then later `primary.goal.goalId` is used in the return value. This path is safe but the logic is fragile — an explicit guard for "focusGoalIds don't match any real goals" would be clearer.

---

### 13. Modes → Personas rename is incomplete in `.gitignore` patterns

The codebase renamed `modes/` → `personas/`, but the `.gitignore` only addresses desktop sidecar patterns. If there were any mode-specific ignore patterns elsewhere, they may not have been updated. (Not a confirmed bug, just a hygiene check worth verifying.)

---

## Summary

| Severity    | Count | Key Items                                                                    |
| ----------- | ----- | ---------------------------------------------------------------------------- |
| 🔴 Critical | 4     | Sort mutation, evidence log race, memory leak, binary bloat                  |
| 🟡 Moderate | 4     | Stale-data sweep, bad type, falsy-patch ignore, injection skip               |
| 🟢 Minor    | 5     | Duplicate skills, eager reads, noisy regex, fragile fallback, rename hygiene |
