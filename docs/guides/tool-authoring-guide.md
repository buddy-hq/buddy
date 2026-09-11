# Buddy Tool Authoring Guide

This guide explains how Buddy learning tools are defined, registered, allowed for personas, and tested.

The short version:

- Implement behavior with `createBuddyTool(...)` in `packages/buddy/src/learning/runtime/create-buddy-tool.ts`.
- Attach the tool on the owning feature via `defineBuddyFeature({ tools })`.
- Register the feature in `packages/buddy/src/learning/features/index.ts` (`ALL_BUDDY_FEATURES`).
- Grant access by attaching that feature on the persona (`features: ...`). Catalog `tools.static` / `tools.dynamic` are derived in `persona-profiles.ts`.
- Do not hand-maintain OpenCode persona permission maps; `config/opencode/agents.ts` derives them.

Being implemented, registered, and allowed are separate states. A tool can exist in code and still be unavailable if it is missing from the feature `tools` array, missing from `ALL_BUDDY_FEATURES`, not on the persona's `features` list, denied by constraints, or disabled by config.

## Current Model

| Layer | File | Purpose |
| --- | --- | --- |
| Tool definition | Owning feature, usually `learning/features/<feature>/tools/<tool>.ts` | Runtime behavior, zod parameters, `ctx.ask`, `presentation`, result |
| Feature membership | Owning `learning/features/<feature>/feature.ts` | `defineBuddyFeature({ tools, skills, subagents, surfaces })` |
| Feature catalog | `packages/buddy/src/learning/features/index.ts` | `ALL_BUDDY_FEATURES` |
| Derived tool metadata | `packages/buddy/src/learning/runtime/tool-metadata.ts` | IDs and `constraints` collected from features (not a hand-maintained `LEARNING_TOOL_METADATA` table) |
| Runtime tool list | `packages/buddy/src/learning/runtime/tool-registry.ts` | All feature tools plus dynamic search/load tools |
| Access policy | Persona `features` list | Who receives the tool; static/dynamic maps are derived |
| Permission compilation | `tool-permission-compiler.ts` + `config/opencode/agents.ts` | Persona defaults, constraints, config toggles |

Core files:

- `packages/buddy/src/learning/runtime/create-buddy-tool.ts`
- `packages/buddy/src/learning/runtime/define-buddy-feature.ts`
- `packages/buddy/src/learning/runtime/tool-metadata.ts`
- `packages/buddy/src/learning/runtime/tool-registry.ts`
- `packages/buddy/src/learning/runtime/tool-permission-compiler.ts`
- `packages/buddy/src/learning/runtime/tool-constraint-types.ts`
- `packages/buddy/src/learning/personas/*.ts`
- `packages/buddy/src/config/opencode/agents.ts`

There is no `packages/buddy/src/learning/tools/` tree and no `LEARNING_TOOL_METADATA` constant.

## Permission Precedence

Runtime learning-tool permissions are compiled in this order (`tool-permission-compiler.ts`):

1. Apply derived persona `tools.static` (and enable search/load when any `tools.dynamic` is allow).
2. Deny tools whose `constraints` do not match runtime (teaching workspace / advanced-math / standards).
3. Deny tools disabled by project config `tools`.

Static OpenCode-facing persona permissions are derived from the same policy in `agents.ts`. Do not add duplicate learning-tool permissions to persona `runtime.permission` just to keep OpenCode aligned.

## Add a Tool

### 1. Choose the contract

Pick the final tool ID first. It is used as:

- the runtime tool name
- the `ctx.ask({ permission })` key
- the derived catalog ID
- the project config `tools` toggle key

Use stable snake case, for example `python_calculator` or `save_flashcard_deck`.

Also decide:

- owning feature
- `constraints` (optional): `teachingWorkspace: "active"` and/or `runtime: "advanced-math" | "standards"`
- `presentation` (required)
- whether UI needs structured metadata from the result

### 2. Implement the tool

Use `createBuddyTool(...)` and a zod parameter schema. `presentation` is required.

```ts
import z from "zod"
import { createBuddyTool } from "../../../runtime/create-buddy-tool"

const exampleInputSchema = z.object({
  topic: z.string().trim().min(1),
})

export const exampleTool = createBuddyTool({
  id: "example_tool",
  description: "Do the specific thing this tool is responsible for.",
  parameters: exampleInputSchema,
  presentation: {
    archetype: "inline-output",
    icon: "tool",
    renderer: "generic",
    layoutRole: "compact-output",
    phases: {
      pending: { action: "Working" },
      running: { action: "Working" },
      completed: { action: "Done" },
      error: { action: "Failed" },
    },
  },
  async execute(args, ctx) {
    await ctx.ask({
      permission: "example_tool",
      patterns: ["*"],
      always: ["*"],
      metadata: {
        topic: args.topic,
      },
    })

    return {
      title: "Example tool",
      output: `Handled ${args.topic}.`,
    }
  },
})
```

See `packages/buddy/src/learning/features/calculator/tools/python-calculator.ts` for a shipped example (`constraints.runtime: "advanced-math"`).

Rules:

- Keep the permission key aligned with the tool ID unless there is a deliberate reason not to.
- Keep side effects behind `ctx.ask(...)`.
- Pass `ctx.abort` into long-running work and runtime services when possible.
- Keep the tool in the feature that owns the behavior.
- Use `import type` for type-only imports.

### 3. Write a useful description

OpenCode and Codex tool descriptions are written for model routing, not for human API docs. Good descriptions tell the model when to call the tool, when not to call it, how to fill parameters, what state the tool changes, and what operational limits matter.

Use this shape:

```ts
description: [
  "Create a saved flashcard deck from validated notes.",
  "",
  "Use this tool when the learner asks to persist a deck or when a practice flow has finalized card content.",
  "",
  "Do not use this tool for drafts, previews, or one-off card suggestions that should remain in the chat.",
  "",
  "Usage:",
  "- `title` should be the learner-facing deck title.",
  "- `cards` must contain final front/back content, not source notes.",
  "- Prefer one call with the complete deck instead of repeated calls for individual cards.",
].join("\n")
```

Description rules:

- Start with the concrete capability, not vague intent like "helps with flashcards".
- Include "Use this tool when..." for the positive routing case.
- Include "Do not use..." when there is a nearby tool, cheaper path, or unsafe misuse.
- Spell out parameter expectations that the schema cannot express well, such as absolute paths, final vs draft content, or batching.
- Mention limits, truncation, readiness, or follow-up behavior that affects model decisions.
- If behavior depends on platform, mode, permissions, runtime readiness, or currently enabled tools, generate that detail into the description instead of relying on stale generic prose.
- For tools with strict or freeform input formats, state the required payload shape and the most common malformed payloads to avoid.
- For tools that affect long-lived state, describe the lifecycle effect: what persists, what is cleared, what later tools can reuse, and whether output is visible to the user or only to the model.
- For discovery or suggestion tools, describe the prerequisite workflow before use so the model does not skip cheaper direct tools.
- Keep examples short and domain-specific. Avoid broad tutorials unless misuse is expensive.
- Keep the schema descriptions short; put workflow guidance in the tool description.

Great descriptions reduce unnecessary permission prompts and wrong-tool calls. If a model could confuse two tools, the descriptions should make the choice obvious.

### 4. Return the right shape

`execute()` returns an OpenCode tool result:

```ts
{
  title: string
  output: string
  metadata?: Record<string, unknown>
  attachments?: FilePart[]
}
```

Use each field for its actual audience:

| Field | Audience | Guidance |
| --- | --- | --- |
| `output` | LLM | Human-readable result text. Put information the model must reason over here. |
| `metadata` | UI/code | Structured data only when a component or downstream code reads it. The model does not see it. |
| `title` | UI | Short card heading. |
| `attachments` | UI/LLM | Files produced by the tool. |

Avoid duplicating the same large JSON blob in both `output` and `metadata`. If the LLM needs structured data, put a readable representation in `output`.

### 5. Add the tool to its feature

Update the owning `feature.ts`:

```ts
export const exampleFeature = defineBuddyFeature({
  id: "example",
  tools: [exampleTool],
  skills: [],
  subagents: [],
  surfaces: [],
})
```

If you skip this, `allBuddyTools()` never sees the tool.

### 6. Derived catalog metadata

Do not add a hand-maintained metadata row. `allLearningToolMetadata()` walks feature tools and records `id`, `featureID`, and optional `constraints`.

Put hard constraints on the tool definition:

```ts
constraints: {
  runtime: "advanced-math",
},
```

Supported constraints (`tool-constraint-types.ts`):

- `teachingWorkspace`: `"active"`
- `runtime`: `"advanced-math"` or `"standards"`

## Allow a Tool

Attach the owning feature on the persona. Example: `features: BUDDY_SHARED_FEATURES` in `packages/buddy/src/learning/personas/buddy.ts`.

`persona-profiles.ts` then allows every non-dynamic tool on those features in `tools.static`. Dynamic tools (`tool.dynamic`) go to `tools.dynamic` and unlock `learning_tool_search` / `learning_tool_load`.

Do not duplicate this in OpenCode agent permissions.

## Add a New Feature Family

Most tools should join an existing feature. Create a new `defineBuddyFeature` only for a real ownership or runtime boundary.

Required updates:

1. Implement the tools and export them from the feature module.
2. Add the feature to `ALL_BUDDY_FEATURES`.
3. Attach the feature on the personas that should receive it (`shared-features.ts` and/or the persona file).

## Project Config Toggles

Once a tool is in the derived catalog, users can disable it by ID in `buddy.json` or `buddy.jsonc`:

```jsonc
{
  "tools": {
    "example_tool": false
  }
}
```

Config toggles can only deny tools. They do not grant access that persona feature membership would otherwise deny.

## Common Failure Modes

- The tool file exists but is missing from the feature `tools` array (or only on a subagent the persona cannot delegate).
- The feature is missing from `ALL_BUDDY_FEATURES`.
- The feature is not attached on the persona that should see the tool.
- The metadata ID and implementation ID differ.
- `constraints` deny the tool in the current workspace/runtime.
- A tool was meant to be scoped to specific personas but was added to `BUDDY_SHARED_FEATURES`, or the reverse.
- Runtime `constraints.runtime` is missing, so a tool is exposed before its runtime is ready.
- `output` is empty or too terse because the author assumed the LLM can read `metadata`.
- `presentation` is omitted (`createBuddyTool` requires it).

## Tests

Add focused tests for the layers you changed. Useful references:

- `packages/buddy/test/learning/tool-permission-compiler.test.ts`
- `packages/buddy/test/learning/runtime-tool-registration.test.ts`
- `packages/buddy/test/learning/persona-tool-permissions.test.ts`
- `packages/buddy/test/learning/tool-schema-compatibility.test.ts`
- `packages/buddy/test/parity/agent.test.ts`

Minimum coverage by change:

- New tool: feature membership and derived catalog alignment.
- New constraints: permission compiler behavior.
- New runtime dependency: readiness gating.
- New feature: `ALL_BUDDY_FEATURES` and persona `features` attachment.
- Persona access change: derived static permissions or parity.

Run focused package tests first. Code changes still require root `bun lint` then root `bun typecheck`.

## Prompt Design Trace and Routing Kernel

This bounded appendix preserves the decision process for authoring tool descriptions. Use the workbook before writing the final prompt; the workbook is a reasoning scaffold, not the shipped tool description. The final prompt should be the shortest natural instruction that makes Buddy choose the right tool, use it safely, and continue the interaction effectively.

### Required 11-part Trace Workbook

~~~markdown
## Tool Prompt Trace Workbook

### 1. Learner-facing goal
What does this tool help Buddy make possible for the learner?

Answer:
...

### 2. Teaching/action move
What action or teaching move does this tool enable?

Answer:
...

### 3. Positive choice triggers
When should Buddy choose this tool?

Answer:
- ...

### 4. Negative choice triggers
When should Buddy avoid this tool?

Answer:
- ...

### 5. Related-tool candidates
List only tools or alternatives that could plausibly compete with this tool for the same user request.

| Candidate | Include? | Relationship | Concrete boundary |
| --- | ---: | --- | --- |
| ... | yes/no | prerequisite / narrower substitute / broader fallback / escalation / downstream / alternative format / forbidden overlap / no-tool alternative | ... |

Include a related tool only when the same request could plausibly trigger both tools, there is a concrete boundary where one wins, and naming it prevents a likely mistake.

### 6. Constraints to include
Add only constraints that change behavior.

| Constraint type | Include? | Why |
| --- | ---: | --- |
| Preconditions | yes/no | ... |
| Execution rules | yes/no | ... |
| Permission boundaries | yes/no | ... |
| Failure handling | yes/no | ... |
| Output handling | yes/no | ... |
| State rules | yes/no | ... |
| Examples | yes/no | ... |

### 7. Length tier
Score the tool.

| Dimension | Score 0-2 | Reason |
| --- | ---: | --- |
| Breadth |  |  |
| Mutation |  |  |
| External impact |  |  |
| Statefulness |  |  |
| Tool overlap |  |  |
| Failure cost |  |  |
| Workflow complexity |  |  |
| Overuse risk |  |  |

Total:
Tier:
Why this length is justified:

### 8. Draft prompt
Write the first prompt draft.

```text
...
```

### 9. Patch pass
Apply step-by-step patches. Each patch must have a reason.

Patch 1 — [name]
Reason:
Before:
```text
...
```
After:
```text
...
```

### 10. Final prompt
```text
...
```

### 11. Final lint
- Does the prompt define when to choose the tool?
- Does it define when not to choose the tool?
- Does it mention only truly related tools?
- Does every related tool have a concrete boundary?
- Are constraints included only where needed?
- Is the length justified?
- Does the prompt read like documentation, not a worksheet?
- Can any sentence be removed without changing behavior?
~~~

### Step-by-Step Patch Workflow (not one big rewrite)

Use the workbook while revising an existing prompt. Do not jump straight to a final rewrite, and do not ship the workbook as the tool description. Each patch should change one behavior: add a missing choice boundary, remove unrelated routing, tighten a negative trigger, add a necessary precondition, remove a vague sentence, naturalize a checklist, add output handling, reduce unjustified length, or promote a critical safety rule.

Use this record for every patch:

~~~markdown
Patch N — [short name]

Reason:
[Why this patch changes behavior.]

Before:
```text
[old text]
```

After:
```text
[new text]
```
~~~

### The Related-Tool Test

Related-tool routing is useful only when it changes a real decision in a plausible request. A candidate is related when Buddy might realistically choose either tool for the same request, one is a required prerequisite, one is a safer or narrower substitute, one is a broader fallback, one is an escalation or downstream step, one is a commonly overused alternative, or the current output explicitly requires it for interpretation or continuation.

Before naming a related tool, answer all four questions:

1. Could the same user request plausibly trigger both tools?
2. Is there a concrete boundary where one should win over the other?
3. Would naming the other tool prevent a likely mistake?
4. Is this relationship common enough to justify prompt tokens?

Include it only if questions 2 and 3 are both answered “yes.” If the only reason is that the tools share a broad category, omit it.

| Relationship | Meaning | Example pattern |
| --- | --- | --- |
| Prerequisite | Use before this tool | Read before Edit |
| Narrower substitute | Prefer for a safer or more specific case | Glob instead of Bash `find` |
| Broader fallback | Use when narrower tools do not fit | Bash when dedicated tools are insufficient |
| Escalation | Use after simpler tools fail or scope expands | Task for open-ended multi-round search |
| Downstream | Use after this tool succeeds | Summarize an agent result after Task |
| Alternative format | Same goal, different representation | Include only when the real choice exists |
| Forbidden overlap | Do not use this tool for that task | Do not use Bash for file operations |
| No-tool alternative | A direct answer is better | Do not use TodoWrite for a trivial answer |

### Related-Tool Relationship Map

The relationship labels above are a map for candidates that pass the test; use one concrete label and boundary rather than listing neighboring tools.

### Related-Tool Budget

Keep a related-tool budget:

| Prompt tier | Related tools to mention |
| --- | ---: |
| Micro | 0 |
| Short | 0–1 |
| Medium | 1–3 |
| Long | 3+ only when every tool has a concrete boundary |

Prefer decision-shaped routing such as “Use this tool for X. Use Glob for filename patterns and Grep for content patterns. Do not use this tool for Q.” Avoid lists such as “Related tools include A, B, C.” Good routing names a specific competing behavior; bad routing names semantic neighbors without a boundary.

### Representative source examples

Use examples when they clarify choice boundaries, overuse boundaries, common mistakes, or a multi-step workflow. The examples below are complete representative shapes from the source corpus.

#### Complete source example: `todowrite`

```text
Use this tool to create and manage a structured task list for your current coding session. This helps you track progress, organize complex tasks, and demonstrate thoroughness to the user.
It also helps the user understand the progress of the task and overall progress of their requests.
```

```text
<example>
User: I want to add a dark mode toggle to the application settings. Make sure you run the tests and build when you're done!
Assistant: I'll help add a dark mode toggle to your application settings. Let me create a todo list to track this implementation.
*Creates todo list with the following items:*
1. Create dark mode toggle component in Settings page
2. Add dark mode state management (context/store)
3. Implement CSS-in-JS styles for dark theme
4. Update existing components to support theme switching
5. Run tests and build process, addressing any failures or errors that occur
*Begins working on the first task*

<reasoning>
The assistant used the todo list because:
1. Adding dark mode is a multi-step feature requiring UI, state management, and styling changes
2. The user explicitly requested tests and build be run afterward
3. The assistant inferred that tests and build need to pass by adding “Ensure tests and build succeed” as the final task
</reasoning>
</example>
```

```text
<example>
User: How do I print 'Hello World' in Python?
Assistant: In Python, you can print "Hello World" with this simple code:

python
print("Hello World")

This will output the text "Hello World" to the console when executed.

<reasoning>
The assistant did not use the todo list because this is a single, trivial task that can be completed in one step. There's no need to track multiple tasks or steps for such a straightforward request.
</reasoning>
</example>
```

#### Complete source examples: `glob` and `grep`

```text
- Fast file pattern matching tool that works with any codebase size
- Supports glob patterns like "**/*.js" or "src/**/*.ts"
- Returns matching file paths sorted by modification time
- Use this tool when you need to find files by name patterns
- When you are doing an open-ended search that may require multiple rounds of globbing and grepping, use the Task tool instead
- You have the capability to call multiple tools in a single response. It is always better to speculatively perform multiple searches as a batch that are potentially useful.
```

```text
- Fast content search tool that works with any codebase size
- Searches file contents using regular expressions
- Supports full regex syntax (eg. "log.*Error", "function\s+\w+", etc.)
- Filter files by pattern with the include parameter (eg. "*.js", "*.{ts,tsx}")
- Returns file paths and line numbers with at least one match sorted by modification time
- Use this tool when you need to find files containing specific patterns
- If you need to identify/count the number of matches within files, use the Bash tool with `rg` (ripgrep) directly. Do NOT use `grep`.
- When you are doing an open-ended search that may require multiple rounds of globbing and grepping, use the Task tool instead
```

#### Complete source examples: `edit` and `apply_patch`

```text
Performs exact string replacements in files.

Usage:
- You must use your `Read` tool at least once in the conversation before editing. This tool will error if you attempt an edit without reading the file.
- When editing text from Read tool output, preserve the exact indentation (tabs/spaces) as it appears after the line-number prefix. The prefix is line number + colon + space (for example, `1: `); never include it in oldString or newString.
- Always prefer editing existing files. Never write new files unless explicitly required.
- Only use emojis if the user explicitly requests it. Avoid adding emojis to files unless asked.
- The edit fails if oldString is not found, with `oldString not found in content`.
- The edit fails if oldString is found multiple times, with `Found multiple matches for oldString. Provide more surrounding lines in oldString to identify the correct match.` Provide more context or use replaceAll to change every instance.
- Use replaceAll for replacing and renaming strings across the file when every occurrence should change.
```

```text
Use the apply_patch tool to edit files. The patch is a file-oriented diff:

*** Begin Patch
[ one or more file sections ]
*** End Patch

Each operation must have a header:

*** Add File: <path>       - create a file; every following line is a + line
*** Delete File: <path>    - remove an existing file; nothing follows
*** Update File: <path>   - patch an existing file in place (optionally rename)

Example:

*** Begin Patch
*** Add File: hello.txt
+Hello world
*** Update File: src/app.py
@@ def greet():
-print("Hi")
+print("Hello, world!")
*** Delete File: obsolete.txt
*** End Patch

Always include the intended Add/Delete/Update header and prefix new lines with +.
```

#### Complete source examples: `spawn_agent` and `task`

```text
Spawn a sub-agent for a well-scoped task. Returns the spawned agent id plus the user-facing nickname when available.

This spawn_agent tool provides access to smaller but more efficient sub-agents. A mini model can solve many tasks faster than the main model.

Only use `spawn_agent` if and only if the user explicitly asks for sub-agents, delegation, or parallel agent work.

When delegating, first quickly analyze the overall user task and form a succinct high-level plan. Identify immediate blockers on the critical path and sidecar work that can run in parallel without blocking the next local step. Use the smaller subagent for an easy-enough independent subtask; keep work local when it is tightly coupled, urgent, too difficult to delegate, or likely to block the immediate next step.

Delegated subtasks must be concrete, well-defined, self-contained, and materially advance the main task. Do not duplicate work between the rollout and subtask; narrow the delegated ask to the concrete output needed next.

After delegating, wait sparingly—only when the result is needed immediately for the next critical-path step. Do not redo delegated work; integrate its result or tackle non-overlapping work.

Run multiple independent information-seeking subtasks in parallel when they answer distinct questions, and split implementation into disjoint codebase slices only when their write scopes do not overlap.
```

```text
Launch a new agent to handle complex, multistep tasks autonomously.

When using the Task tool, you must specify a `subagent_type` parameter to select which agent type to use.

When to use the Task tool:
- When instructed to execute custom slash commands, use Task with the slash-command invocation as the entire prompt. For example:

Task(description="Check the file", prompt="/check-file path/to/file.py")

When NOT to use the Task tool:
- If you want to read a specific known file path, use Read or Glob instead.
- If you are searching for a specific class definition, use Glob instead.
- If you are searching code within one file or a small known set of files, use Read instead.
- Do not use Task for other work unrelated to the available agent descriptions.

Usage notes:
1. Launch multiple agents concurrently whenever possible; each completed agent returns a single result and a task id for follow-up.
2. The returned result is not automatically visible to the user; send a concise summary when the user needs it.
3. A new agent starts with fresh context unless you continue it with its task id, so include a detailed self-contained prompt and the exact output needed.
4. Trust the result as a useful input, but verify it when possible.
5. Clearly state whether the agent should write code or research, and explain how it should verify the work.
```

### Prompt Burden Scoring

Score each dimension from 0 to 2 before choosing the maximum reasonable prompt length:

| Dimension | 0 | 1 | 2 |
| --- | --- | --- | --- |
| Breadth | narrow | moderate | can do many things |
| Mutation | read-only | limited changes | edits, deletes, or external changes |
| External impact | local/internal | limited external | user-visible or remote effects |
| Statefulness | stateless | uses prior context | creates or persists state |
| Tool overlap | unique | some overlap | many nearby tools |
| Failure cost | low | recoverable | costly or destructive |
| Workflow complexity | one step | few steps | procedural workflow |
| Overuse risk | unlikely | possible | highly likely |

| Total score | Tier | Shape |
| ---: | --- | --- |
| 0–2 | Micro | one sentence |
| 3–5 | Short | one compact paragraph |
| 6–9 | Medium | 1–3 compact paragraphs |
| 10+ | Long | structured prose; bullets and examples allowed |

The score is an upper bound, not a command to be verbose. A long prompt is justified by risk, ambiguity, overlap, state, or workflow depth—not by a desire to include every nearby detail.

### Final Checklist

Before finalizing a Buddy tool prompt, ask:

1. Does it explain what the tool enables?
2. Does it define when Buddy should choose it?
3. Does it define when Buddy should not choose it?
4. Does it mention only truly related tools?
5. Does every related tool have a concrete boundary where it wins?
6. Would naming it prevent a likely mistake?
7. Are preconditions included only when correctness depends on them?
8. Are execution rules specific enough to prevent real mistakes?
9. Are permission boundaries explicit for sensitive actions?
10. Are failure modes specific and actionable?
11. Does output handling say what Buddy should do next?
12. Are state rules included for stateful tools?
13. Are examples included only when they clarify judgment?
14. Is the length justified by risk, overlap, state, or workflow?
15. Could any sentence be removed without changing behavior?

This guide is a decision process, not a template generator. Add related tools only when they change a real decision. Produce the trace workbook first, patch your way to the final prompt, then ship only the natural prompt.
