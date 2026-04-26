# Buddy Tool Authoring Guide

This guide explains how Buddy learning tools are defined, registered, allowed for personas, and tested.

The short version:

- Implement behavior with `createBuddyTool(...)`.
- Add the tool to the owning feature's `tools.ts` array.
- Add catalog identity and constraints in `learning/tools/tool-metadata.ts`.
- Make sure the owning family is wired in `learning/tools/tool-registry.ts`.
- Grant access through persona `toolDefaults`.
- Do not hand-maintain OpenCode persona permission maps; Buddy derives them.

Being implemented, registered, and allowed are separate states. A tool can exist in code and still be unavailable if it is missing from the family array, the catalog, runtime registration, or permission policy.

## Current Model

A Buddy learning tool has these parts:

| Layer | File | Purpose |
| --- | --- | --- |
| Tool definition | Owning feature, usually `learning/**/tools/<tool>.ts` | Runtime behavior, zod parameters, permission ask, result |
| Family membership | Owning feature `tools.ts` | Exports a group array such as `mathTools` or `teachingTools` |
| Catalog metadata | `packages/buddy/src/learning/tools/tool-metadata.ts` | Stable tool IDs, group ownership, capability constraints, group runtime policy |
| Runtime registration | `packages/buddy/src/learning/tools/tool-registry.ts` | Maps catalog groups to actual tool arrays |
| Registration execution | `packages/buddy/src/learning/tools/register-runtime-tools.ts` | Registers enabled groups into OpenCode |
| Access policy | Persona definitions | Decides who can use the tool |
| Permission compilation | `tool-permission-compiler.ts` and session permission sync | Applies runtime rules for the active turn |

Core files:

- `packages/buddy/src/learning/tools/create-buddy-tool.ts`
- `packages/buddy/src/learning/tools/tool-metadata.ts`
- `packages/buddy/src/learning/tools/tool-registry.ts`
- `packages/buddy/src/learning/tools/register-runtime-tools.ts`
- `packages/buddy/src/learning/tools/tool-permission-compiler.ts`
- `packages/buddy/src/learning/tools/tool-constraints.ts`
- `packages/buddy/src/learning/intents/*/capabilities.ts`
- `packages/buddy/src/learning/personas/*.ts`
- `packages/buddy/src/config/opencode/agents.ts`

## Permission Precedence

Runtime learning-tool permissions are compiled in this order:

1. Apply persona `toolDefaults`.
2. Deny tools whose catalog constraints do not match the persona surface or workspace state.
3. Deny tools whose runtime dependency is not ready.
4. Deny tools disabled by project config `tools`.

Static OpenCode-facing persona permissions are derived from the same canonical policy. Do not add duplicate learning-tool permissions to persona runtime config just to keep OpenCode aligned.

## Add a Tool

### 1. Choose the contract

Pick the final tool ID first. It is used as:

- the runtime tool name
- the `ctx.ask({ permission })` key
- the learning-tool catalog ID
- the project config `tools` toggle key

Use stable snake case, for example `python_calculator` or `save_flashcard_deck`.

Also decide:

- owning feature and family
- required persona surfaces, workspace states, or runtime dependencies
- whether UI needs structured metadata from the result

### 2. Implement the tool

Use `createBuddyTool(...)` and a zod parameter schema.

```ts
import z from "zod"
import { createBuddyTool } from "../../../tools/create-buddy-tool"

const exampleInputSchema = z.object({
  topic: z.string().trim().min(1),
})

export const exampleTool = createBuddyTool("example_tool", {
  description: "Do the specific thing this tool is responsible for.",
  parameters: exampleInputSchema,
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

### 5. Add the tool to its family

Update the owning `tools.ts`:

```ts
import { exampleTool } from "./example-tool"
import { existingTool } from "./existing-tool"

export const featureTools = [existingTool, exampleTool] as const
```

If you skip this, runtime registration never sees the tool.

### 6. Add catalog metadata

Add the tool to `LEARNING_TOOL_METADATA` in `packages/buddy/src/learning/tools/tool-metadata.ts`.

```ts
{ id: "example_tool", group: "teaching" },
```

If the tool has hard constraints, put them in catalog metadata:

```ts
{
  id: "example_tool",
  group: "teaching",
  capability: {
    surfaces: [EDITOR_PERSONA_SURFACE],
    workspaceStates: [INTERACTIVE_WORKSPACE_STATE],
  },
},
```

Supported constraints:

- `surfaces`: `"curriculum"`, `"editor"`, `"figure"`, `"question-set"`
- `workspaceStates`: `"chat"`, `"interactive"`
- `runtimeDependency`: `ADVANCED_MATH_RUNTIME_DEPENDENCY` or `STANDARDS_RUNTIME_DEPENDENCY`

Group-level runtime dependency belongs in `LEARNING_TOOL_GROUP_POLICIES` when every tool in the group shares the same dependency. Tool-level dependency belongs on the individual metadata entry.

## Allow a Tool

There are two normal ways to grant access.

### Persona-default tools

Use persona defaults when the tool should be available to a persona, subject to catalog constraints, runtime readiness, and config toggles.

Edit `packages/buddy/src/learning/personas/<persona>.ts`:

```ts
toolDefaults: {
  learner_snapshot_read: "allow",
  example_tool: "allow",
},
```

Do not duplicate this in OpenCode agent permissions. `packages/buddy/src/config/opencode/agents.ts` derives static learning-tool permissions from Buddy policy.

## Add a New Tool Family

Most tools should join an existing family. Create a new family only for a real ownership or runtime boundary.

Required updates:

1. Add the owning feature `tools.ts` export.
2. Add a group entry in `LEARNING_TOOL_GROUP_POLICIES` in `tool-metadata.ts`.
3. Add each tool ID to `LEARNING_TOOL_METADATA` with that group.
4. Import the family and add it to `learningToolGroups` in `tool-registry.ts`.
5. Make sure callers that build `LearningToolRegistrationFlags` enable or disable the group as intended.

You usually do not need to edit proxy route types for a new family; registration flags are keyed by `LearningToolGroup`.

## Project Config Toggles

Once a tool is in the learning tool catalog, users can disable it by ID in `buddy.json` or `buddy.jsonc`:

```jsonc
{
  "tools": {
    "example_tool": false
  }
}
```

Config toggles can only deny tools. They do not grant access that persona policy would otherwise deny.

## Common Failure Modes

- The tool file exists but is missing from the family array.
- The tool is in a family array but missing from `LEARNING_TOOL_METADATA`.
- The metadata ID and implementation ID differ.
- The family exists in metadata but is missing from `tool-registry.ts`.
- A persona default grants the tool, but catalog surface or workspace constraints deny it.
- A tool was meant to be scoped to specific personas but was added to all persona defaults, or the reverse.
- Runtime dependency metadata is missing, so a tool is exposed before its runtime is ready.
- `output` is empty or too terse because the author assumed the LLM can read `metadata`.

## Tests

Add focused tests for the layers you changed. Useful references:

- `packages/buddy/test/learning/learning-tool-contract.test.ts`
- `packages/buddy/test/learning/tool-registration-policy.test.ts`
- `packages/buddy/test/learning/runtime-tool-registration.test.ts`
- `packages/buddy/test/learning/tool-permission-compiler.test.ts`
- `packages/buddy/test/learning/tool-capability-policy.test.ts`
- `packages/buddy/test/learning/runtime-session-permissions.test.ts`
- `packages/buddy/test/parity/agent.test.ts`

Minimum coverage by change:

- New tool: family membership and catalog alignment.
- New catalog constraints: runtime permission compiler behavior.
- New runtime dependency: readiness gating.
- New family: registration policy and runtime registration.
- Persona access change: static persona permission derivation or parity.

Run focused package tests first. Before considering the task complete, the repo requirement is still:

```bash
bun fmt
bun lint
bun typecheck
```
