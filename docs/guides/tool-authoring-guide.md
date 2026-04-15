# Buddy Tool Authoring Guide

This guide explains how tools are authored in Buddy after the tools refactor, where the real authority lives, and exactly what to change when you add a new tool or change who can use one.

It answers four separate questions:

1. How to write a tool.
2. How to make the runtime know the tool exists.
3. How to allow the tool for a persona.
4. How to allow the tool only for a specific intent, including a specific intent for a specific persona such as `assess` for `code-buddy` but not `practice` for `code-buddy`.

The core rule is:

- tool implementation lives with the owning feature
- tool metadata lives on the tool definition
- persona-default access lives in persona definitions via `toolDefaults`
- intent-specific access lives in the intent manifests
- static OpenCode-facing persona tool permissions are derived from canonical Buddy policy, not maintained by hand in persona agent files

If you follow that split, tool work is predictable. If you do not, you end up fighting two permission systems at once.

## What a Tool Is in Buddy

A working Buddy tool is the combination of:

1. A `createBuddyTool(...)` definition.
2. Membership in a tool family array such as `teachingTools`, `pedagogyTools`, or `questionSetTools`.
3. Inclusion in the global learning tool catalog.
4. Registration of the owning tool family into the vendored OpenCode runtime.
5. Capability gating through persona defaults, intent manifests, tool metadata, runtime readiness, and config toggles.
6. Session permission syncing for the active turn.
7. Static persona agent permission alignment in the OpenCode overlay.

Being implemented is not the same as being registered.

Being registered is not the same as being allowed.

## Canonical Sources of Truth

These files are the main authority for tools:

- `packages/buddy/src/learning/tools/create-buddy-tool.ts`
- `packages/buddy/src/learning/tools/tool-catalog.ts`
- `packages/buddy/src/learning/tools/register-runtime-tools.ts`
- `packages/buddy/src/learning/tools/tool-capability-policy.ts`
- `packages/buddy/src/learning/resolve-capability-profile.ts`
- `packages/buddy/src/learning/intents/learn/capabilities.ts`
- `packages/buddy/src/learning/intents/practice/capabilities.ts`
- `packages/buddy/src/learning/intents/assess/capabilities.ts`
- `packages/buddy/src/learning/intents/capabilities/tool-capabilities.ts`
- `packages/buddy/src/learning/intents/capabilities/resolution.ts`
- `packages/buddy/src/learning/intents/capabilities/validation.ts`
- `packages/buddy/src/config/opencode/agents.ts`

Related registration plumbing:

- `packages/buddy/src/http/proxy/registration.ts`
- `packages/buddy/src/http/proxy/types.ts`
- `packages/buddy/src/http/proxy/fetch.ts`
- `packages/buddy/src/session/orchestration/proxy-transform.ts`

Persona defaults that tools depend on:

- `packages/buddy/src/learning/personas/<persona-id>/agent.ts`
- `packages/buddy/src/learning/personas/definitions.ts`

## The Current Tool Model

After the refactor, Buddy tools follow these rules:

- The tool file is responsible for its behavior and its colocated constraints.
- Surface, workspace-state, and runtime-dependency constraints belong on the tool definition through `createBuddyTool(..., capability)`.
- Intent-managed tool authority comes from the intent manifests.
- `TOOL_CAPABILITY_REGISTRY` is derived from the intent manifests. You no longer hand-maintain a second registry of intent-managed tools.
- Persona-default tool access comes from `toolDefaults` in persona definition files.
- Static OpenCode-facing learning-tool permissions for personas are derived from canonical Buddy policy in `packages/buddy/src/config/opencode/agents.ts`.
- Persona `agent.ts` files should not restate learning-tool permissions.

The runtime precedence is:

1. persona defaults
2. persona/workspace constraints from tool metadata
3. intent overrides
4. runtime readiness constraints
5. config toggles

If you are reasoning about why a tool is or is not callable, follow that order.

## Files You Usually Do Not Edit For Normal Tool Work

For a normal tool addition inside an existing family, you should usually not need to edit:

- `packages/buddy/src/config/opencode/agents.ts`
- `packages/buddy/src/learning/agent-factories.ts`
- `packages/buddy/src/http/proxy/fetch.ts`
- `packages/buddy/src/http/proxy/types.ts`

If you find yourself changing those files for a plain tool addition, that usually means one of two things:

- you are adding a brand new tool family, or
- the architecture still has a simplification gap that should be handled as refactor work, not as one-off tool authoring

## Tool Metadata Lives with the Tool

`createBuddyTool(...)` now supports capability metadata.

The supported metadata is:

- `surfaces`
- `workspaceStates`
- `runtimeDependency`

Current exported helpers in `packages/buddy/src/learning/tools/create-buddy-tool.ts`:

- `EDITOR_PERSONA_SURFACE`
- `FIGURE_PERSONA_SURFACE`
- `INTERACTIVE_WORKSPACE_STATE`
- `ADVANCED_MATH_RUNTIME_DEPENDENCY`
- `STANDARDS_RUNTIME_DEPENDENCY`

Example:

```ts
import {
  createBuddyTool,
  EDITOR_PERSONA_SURFACE,
  INTERACTIVE_WORKSPACE_STATE,
  type BuddyToolContext,
} from "@buddy/backend/learning/tools/create-buddy-tool"

export const exampleEditorTool = createBuddyTool(
  "example_editor_tool",
  {
    description: "Do something that only makes sense in the lesson editor.",
    parameters: ExampleInputSchema,
    async execute(args, ctx: BuddyToolContext) {
      await ctx.ask({
        permission: "example_editor_tool",
        patterns: ["*"],
        always: ["*"],
      })

      return {
        title: "Example editor tool",
        output: "Done",
      }
    },
  },
  {
    surfaces: [EDITOR_PERSONA_SURFACE],
    workspaceStates: [INTERACTIVE_WORKSPACE_STATE],
  },
)
```

This metadata is consumed by:

- `packages/buddy/src/learning/resolve-capability-profile.ts`
- `packages/buddy/src/learning/tools/tool-capability-policy.ts`

Do not add new hardcoded surface or workspace deny lists in unrelated runtime files when the constraint belongs to the tool itself.

## Runtime Flow

This is the actual path from tool file to callable tool:

1. You define the tool with `createBuddyTool(...)`.
2. You add it to the owning family array in `tools.ts`.
3. `tool-catalog.ts` includes that family, which makes the tool part of the global learning tool catalog.
4. Request-time registration turns the enabled tool families into OpenCode runtime tools.
5. `resolveCapabilityProfile()` decides whether the tool is allowed for the current turn.
6. Session permissions are synced into the active runtime session.
7. Persona agent overlays derive static learning-tool permissions from canonical Buddy policy.

If any one of those steps is missing, the tool may exist in code but still not be callable.

## Step-by-Step: Add a New Tool

Use this sequence in order.

### Minimal Expected Diff

For a new tool in an existing family, the normal diff is:

- `packages/buddy/src/learning/capabilities/<feature>/tools/<tool>.ts`
- `packages/buddy/src/learning/capabilities/<feature>/tools/tools.ts`
- one or more of:
  - `packages/buddy/src/learning/personas/<persona-id>/agent.ts`
  - `packages/buddy/src/learning/intents/learn/capabilities.ts`
  - `packages/buddy/src/learning/intents/practice/capabilities.ts`
  - `packages/buddy/src/learning/intents/assess/capabilities.ts`
- focused tests in `packages/buddy/test/**`

If you are creating a new tool family, there are more required changes. That is covered later.

### Step 1: Choose the Tool Contract

Decide:

- `id`: stable snake_case tool ID
- owning feature
- owning tool family
- whether the tool is persona-default or intent-managed
- whether the tool needs surface constraints
- whether the tool needs workspace-state constraints
- whether the tool needs runtime-readiness gating

The tool ID becomes:

- the runtime tool name
- the permission key used in `ctx.ask({ permission: ... })`
- the learning-tool catalog key
- the config `tools` toggle key

Choose the final ID before wiring the rest.

### Step 2: Implement the Tool

Create the tool file in the owning feature.

Canonical shape:

```ts
import z from "zod"
import { createBuddyTool, type BuddyToolContext } from "../../../tools"

const exampleInputSchema = z.object({
  topic: z.string().trim().min(1),
})

export const exampleTool = createBuddyTool("example_tool", {
  description: "Do the specific thing this tool is responsible for.",
  parameters: exampleInputSchema,
  async execute(args, ctx: BuddyToolContext) {
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
      output: `Handled ${args.topic}`,
    }
  },
})
```

Rules:

- Use `createBuddyTool(...)`.
- Use a `zod` schema for parameters.
- Keep the `ctx.ask(...)` permission key aligned with the tool ID unless there is a specific reason not to.
- Keep the tool in the feature that owns the behavior.

### Step 3: Add the Tool to Its Family Array

Update the owning `tools.ts`.

Example:

```ts
import { existingTool } from "./existing-tool"
import { exampleTool } from "./example-tool"

const featureTools = [existingTool, exampleTool] as const

export { featureTools }
```

If you skip this, the tool file exists but the runtime never sees it.

### Step 4: Add Tool Metadata If the Tool Has Hard Constraints

If the tool only works on a specific surface, workspace state, or runtime dependency, encode that on the tool itself with the third `createBuddyTool(...)` argument.

Use metadata when:

- the tool only works for personas with the `editor` surface
- the tool only works for personas with the `figure` surface
- the tool only works in `interactive` workspace state
- the tool requires the standards runtime
- the tool requires the advanced math runtime

Do not add new hardcoded constraint buckets elsewhere if the constraint belongs to one tool.

### Step 5: Decide Whether the Tool Is Persona-default or Intent-managed

This is the main authoring decision.

Choose one:

1. Persona-default tool
2. Intent-managed tool
3. Intent-managed tool scoped to certain personas
4. Intent-managed tool scoped to certain personas and certain workspace states

The next sections show exactly what to edit.

## How to Allow a Tool for a Given Persona

Use this when the tool should be available to a persona across intents, subject to tool metadata, runtime readiness, and config toggles.

### Files to Edit

- `packages/buddy/src/learning/personas/<persona-id>/agent.ts`
- optionally `packages/buddy/src/learning/personas/<persona-id>/overlay.p.md`

### What to Change

Add the tool ID to that persona's `toolDefaults`.

Example:

```ts
export const CODE_BUDDY = defineBuddyPersona({
  // ...
  toolDefaults: {
    learner_snapshot_read: "allow",
    teaching_start_lesson: "allow",
    example_tool: "allow",
  },
  // ...
})
```

That is the canonical Buddy authoring point for persona-default tool access.

Do not also add the tool permission to the persona `agent.ts` file just to keep them "aligned". That duplication is specifically what the refactor removed.

### Optional Prompt Update

Only update the prompt overlay if the tool should be part of how the persona reasons or teaches.

Do not mention the tool in prompt prose unless the persona can actually use it.

## How to Allow a Tool for a Given Intent

Use this when the tool should only exist in `learn`, `practice`, or `assess`.

### Files to Edit

- `packages/buddy/src/learning/intents/learn/capabilities.ts`
- `packages/buddy/src/learning/intents/practice/capabilities.ts`
- `packages/buddy/src/learning/intents/assess/capabilities.ts`

depending on which intents should allow the tool.

### What to Change

Add the tool to the `tools` array in the appropriate manifest.

Example for `assess`:

```ts
export const ASSESS_INTENT_CAPABILITY_MANIFEST = createIntentCapabilities({
  intent: "assess",
  tools: [
    // ...
    exampleTool,
  ],
  skills: [],
})
```

Important:

- You do not manually edit a separate central tool-capability registry anymore.
- `packages/buddy/src/learning/intents/capabilities/tool-capabilities.ts` derives `TOOL_CAPABILITY_REGISTRY` from the intent manifests.

If the tool is only intent-managed, do not also add it to persona `toolDefaults` unless you intentionally want both persona-default and intent-managed behavior.

## How to Allow a Tool Only for a Given Persona in a Given Intent

This is the exact scoped case: for example, allow a tool in `assess` for `code-buddy`, but not in `practice` for `code-buddy`.

### Files to Edit

- the specific intent manifest that should allow the tool

For example:

- `packages/buddy/src/learning/intents/assess/capabilities.ts`

### What to Change

Use the object form inside `tools`.

Example:

```ts
export const ASSESS_INTENT_CAPABILITY_MANIFEST = createIntentCapabilities({
  intent: "assess",
  tools: [
    {
      tool: exampleAssessTool,
      personas: ["code-buddy"],
    },
  ],
  skills: [],
})
```

Then do not add it to the `practice` manifest.

Result:

- `code-buddy` + `assess` -> allow
- `code-buddy` + `practice` -> deny
- other personas + `assess` -> deny

`auto` will include it whenever the explicit intent union includes the matching manifest.

## How to Allow a Tool Only for a Given Persona and Only in Interactive Workspace State

Use both filters:

```ts
{
  tool: exampleAssessTool,
  personas: ["code-buddy"],
  workspaceStates: ["interactive"],
}
```

This is how scoped intent-managed tools such as practice-only editor workflows should be expressed now.

If the tool itself also only makes sense in interactive editor sessions, put that requirement on the tool metadata too. The two layers are not the same:

- tool metadata says the tool can never run outside that context
- intent manifest filters say the intent only grants it in that context

## Exact Example: `assess` for `code-buddy`, Not `practice`

If you want a tool available only in `assess` for `code-buddy`:

1. implement the tool and add it to its family
2. do not put it in `code-buddy.toolDefaults`
3. add it only to `ASSESS_INTENT_CAPABILITY_MANIFEST`
4. scope it with `personas: ["code-buddy"]`
5. do not add it to `PRACTICE_INTENT_CAPABILITY_MANIFEST`

Example:

```ts
export const ASSESS_INTENT_CAPABILITY_MANIFEST = createIntentCapabilities({
  intent: "assess",
  tools: [
    {
      tool: exampleAssessTool,
      personas: ["code-buddy"],
    },
  ],
  skills: [],
})
```

That is the current canonical way to express "only in this intent for this persona".

## How Static Persona Agent Permissions Stay Aligned

This part is easy to miss.

Buddy still needs static OpenCode-facing permissions on persona agents, because OpenCode knows about agent config before Buddy's dynamic per-turn session permissions are applied.

That static learning-tool permission map is derived in:

- `packages/buddy/src/learning/tools/tool-capability-policy.ts`
- `packages/buddy/src/config/opencode/agents.ts`

The derivation unions:

- persona `toolDefaults`
- all explicit intent manifests
- all workspace states the persona can satisfy for a tool
- tool metadata constraints

You should not hand-maintain the same learning-tool permission map inside persona `agent.ts` files.

## Runtime Readiness Gating

If a tool depends on a local runtime, express that on the tool metadata.

Current supported dependencies:

- `ADVANCED_MATH_RUNTIME_DEPENDENCY`
- `STANDARDS_RUNTIME_DEPENDENCY`

Those are enforced by:

- `packages/buddy/src/learning/tools/tool-capability-policy.ts`
- `packages/buddy/src/learning/resolve-capability-profile.ts`

Examples already wired this way:

- `python_calculator`
- knowledge-graph tools

## Project Config Tool Toggles

Users can hard-disable any learning tool through:

- `buddy.json`
- `buddy.jsonc`

Example:

```jsonc
{
  "tools": {
    "example_tool": false
  }
}
```

This is applied in `packages/buddy/src/learning/resolve-capability-profile.ts`.

Once the tool is in the learning tool catalog, config toggles can target it by ID.

## When You Need a New Tool Family

Most new tools should go into an existing family. Only create a new family if there is a real ownership or runtime boundary.

If you do create a new family, update:

1. the owning `tools.ts`
2. `packages/buddy/src/learning/tools/tool-catalog.ts`
3. `packages/buddy/src/learning/tools/register-runtime-tools.ts`
   - add a registration policy entry
4. any caller that decides which families to register
   - today the main one is `packages/buddy/src/session/orchestration/proxy-transform.ts`

The good news is that you no longer have to add a separate boolean field everywhere in proxy types. Those proxy types now key off `LearningToolGroup`.

The remaining authoring points for a new family are still real, but fewer than before the refactor.

## Tests to Add or Update

Treat this as required work.

Good reference tests:

- `packages/buddy/test/learning/tool-capability-policy.test.ts`
- `packages/buddy/test/learning/intent-capability-validation.test.ts`
- `packages/buddy/test/learning/runtime-session-permissions.test.ts`
- `packages/buddy/test/parity/agent.test.ts`

At minimum, test the layers you touched:

1. tool family membership or catalog reachability
2. intent resolution if the tool is intent-managed
3. runtime capability profile if the tool has metadata constraints
4. static persona permission derivation if the tool changes persona access

## Common Failure Modes

1. The tool file exists, but it is not in the family array.
2. The tool is in the family array, but the family is missing from `tool-catalog.ts`.
3. The tool has the right persona default, but its tool metadata blocks that persona's surfaces or workspace state.
4. The tool is intended to be intent-managed, but it was never added to the right intent manifest.
5. The tool is intended to be persona-default, but it was only added to an intent manifest.
6. The prompt mentions a tool that the persona cannot actually call.
7. A new tool family was added, but the session proxy never enables registration for that family.
8. Someone reintroduces handwritten learning-tool permissions into persona `agent.ts` files.

## Validation Commands

Run after tool changes:

```bash
bun fmt
bun lint
bun typecheck
```

Run focused tests for the packages you changed. Do not run the full suite.
