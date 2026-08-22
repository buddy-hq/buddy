# Intent Removal And Dynamic Tool Migration Notes

This document captures the decision record for removing Buddy's runtime intent system and replacing intent-gated capability selection with model-directed skill and dynamic tool loading.

Use this as the handoff document for future sessions before revisiting the architecture.

Implementation plan: `docs/artifacts/plans/dynamic-tool-addition-plan.md`.

## User Intention

The intended product direction is:

- Remove `Intent` as a first-class Buddy runtime concept.
- Stop asking the UI, API, session state, learner snapshot query, and tool permission compiler to select `learn`, `practice`, `assess`, or `auto`.
- Keep pedagogy modes as model-usable skills and guidance, not as hardcoded runtime gates.
- Let the model infer what the learner needs from the conversation.
- Let the model load the relevant pedagogy skill.
- Inside that skill, guide the model on which dynamic tools to search for and load.
- Replace manual intent gating with dynamic tool discovery plus session-scoped permission grants.
- Keep persona, workspace state, runtime availability, and user config as hard constraints.

In short: Buddy should stop selecting an intent for the model. The model should decide the teaching move, load guidance, search dynamic tools, and use those tools when they help.

## Current Dynamic Tool Architecture

Buddy does not have Codex's first-class `tool_search_output` support. Therefore Buddy should not make `learning_tool_search` both discover and expose tools.

The production Buddy flow is:

1. `learning_tool_search` searches deferred dynamic learning tool metadata and returns loadable candidates.
2. Search records exact candidate IDs for the current session, but does not register dynamic tools and does not append allow rules.
3. `learning_tool_load` accepts exact IDs from the latest search result.
4. Load registers selected dynamic tools into Buddy's directory-scoped OpenCode adapter registry.
5. Load appends exact session-scoped allow rules after the namespace deny.
6. OpenCode rebuilds tools on the next model loop, and only exact loaded dynamic tools become model-visible for that session.
7. The next Buddy turn clears exact dynamic allows for that session and unregisters dynamic tools that no active session still references.

This preserves Codex's capability separation while adapting to Buddy's current adapter boundary.

## Original Smoke-Test Architecture

This section records the staged smoke test that proved dynamic registration can work mid-turn. It is historical context, not the production target.

The staged dynamic tool smoke test adds:

- `learning_tool_search`: a static discovery tool registered in the `toolDiscovery` group.
- `learning_smoke_practice_tool`: a dynamically registered smoke tool.
- `learning_smoke_assessment_tool`: a dynamically registered smoke tool.
- Session-scoped allow rules appended by `learning_tool_search` after it registers matching tools.
- Default deny rules for the smoke dynamic tool IDs on primary Buddy persona permissions.

The registration path is:

1. `learning_tool_search` calls `registerBuddyTools(ctx.directory, matchedTools)`.
2. `registerBuddyTools()` calls OpenCode `ToolRegistry.register(tool.toTool(directory))`.
3. Buddy's OpenCode adapter stores custom tools keyed by `Instance.directory`.
4. OpenCode's prompt loop rebuilds tools after tool-call continuations.
5. On the next model loop, `registry.tools(...)` includes newly registered tools.
6. OpenCode's LLM layer filters disabled tools using merged agent and session permissions.
7. If the session has an appended allow rule, the dynamic tool is visible to the model.

## Confirmed Findings From The Smoke Test

These were confirmed by code reading and focused tests in `packages/buddy/test/learning/runtime-tool-registration.test.ts`.

### Dynamic Registration Works Mid-Turn

OpenCode rebuilds the tool list after a tool-call continuation. A tool registered by `learning_tool_search` can be present on the next model loop within the same assistant turn.

Relevant code:

- `vendor/opencode/packages/opencode/src/session/prompt.ts`: loop calls `resolveTools(...)` each step.
- `packages/opencode-adapter/src/registry.ts`: Buddy custom tools are merged into OpenCode's registry by directory.

### Normal Model Tool Visibility Is Permission Filtered

OpenCode filters tools before exposing them to the model with:

```ts
Permission.disabled(Object.keys(input.tools), Permission.merge(input.agent.permission, input.permission ?? []))
```

This means a default-denied dynamic tool is hidden from the model in the normal prompt loop.

Relevant code:

- `vendor/opencode/packages/opencode/src/session/llm.ts`

### Session Allow Overrides Primary-Agent Deny

Permission merge order is agent permission first, then session permission. OpenCode evaluates the last matching rule. Therefore:

- primary agent deny hides a dynamic tool by default
- session allow appended by `learning_tool_search` makes that dynamic tool visible for that session

The added test verifies:

- dynamic tool is directory-visible after search
- searched session has `{ permission: dynamicToolID, pattern: "*", action: "allow" }`
- searched session does not disable the dynamic tool
- untouched session still disables the dynamic tool under the primary Buddy permission defaults

### The Registry Is Directory-Scoped

Dynamic tools are stored by directory, not session. After one session registers a tool, other sessions in the same directory can see that tool at the registry/listing layer.

Session permissions can hide it from the model, but the registration itself is not session-local.

### Subagent Namespace Deny Was A Real Gap

The original smoke denies were added to primary persona permissions. Subagents like `practice-agent` and `assessment-agent` did not inherit those denies.

The production fix is to apply the dynamic namespace deny to every Buddy primary agent and subagent permission map, not to exact smoke IDs.

The implementation must keep a regression test proving subagents default-deny directory-registered dynamic tools.

## Corrected Earlier Assessment

The concern "default deny does not matter unless the tool calls `ctx.ask()`" is not accurate for the normal model loop. The model loop filters denied tools before the model sees them.

The narrower truth is:

- direct test execution of a runtime tool can bypass model-loop visibility filtering
- real assistant execution uses the OpenCode LLM tool filter first
- individual tool `ctx.ask()` calls still matter for user approval flows and extra execution-time protection, but they are not the only mechanism hiding denied tools from the model

## Remaining Risks

### Dynamic Tool Namespace Is Required

Production dynamic tools need a stable namespace so Buddy can deny them by wildcard for every agent before session load grants specific tools.

Current namespace:

```text
learning_dynamic_*
```

Avoid naming dynamic tools under broad existing prefixes that could collide with static tool IDs.

### Deny Policy Must Cover All Agents

The default deny must apply to:

- all Buddy primary personas
- all Buddy subagents
- future Buddy-authored agents that can run in learning sessions

Do not only patch primary persona runtime permissions.

### Session Allows Need Lifecycle Management

Production dynamic grants should last through the current assistant turn and be cleared before the next Buddy turn in the same session.

The load tool must append exact session allows only for selected IDs from the latest search candidates. It must not grant the whole dynamic namespace.

### Directory-Scoped Registry Needs A Policy

The underlying registry is directory-scoped. That is compatible with session permission filtering, but it has UX and safety implications:

- another session may list a registered dynamic tool at the registry level
- a subagent without the default deny may see the tool
- stale dynamic tools can accumulate unless unregistered

Production options:

- keep directory-scoped registry and enforce session visibility through permissions
- add per-session registration metadata and filter custom tools by session
- unregister dynamic tools at turn/session lifecycle boundaries

### Skill Routing Cannot Be Hidden Inside The Skill

A skill can tell the model how to search dynamic tools only after the skill is loaded.

Therefore:

- always-visible prompt text must tell the model when to use pedagogy skills
- skill descriptions must be strong enough for the model to choose the skill
- detailed dynamic-search guidance can live inside the loaded skill

### Dynamic Search Needs Structured Metadata

Keyword matching is enough for the smoke test. Production search needs metadata such as:

- teaching mode: `learn`, `practice`, `assess`, `reflect`, `debug`, `resource`
- persona compatibility
- workspace-state requirements
- runtime dependencies
- side effects
- whether it mutates learner state
- whether it requires a focused goal
- what outcome should be recorded afterward

## Implementation Guidelines

- Use a single dynamic tool namespace and enforce default deny with a wildcard rule.
- Make dynamic search return candidates only. Use a separate load step to grant specific tool IDs to the current session, not broad namespace allows.
- Keep `learning_tool_search` itself static and persona-gated.
- Keep dynamic tool registration separate from dynamic tool authorization.
- Keep dynamic tool discovery separate from dynamic tool exposure because Buddy does not have Codex's first-class `tool_search_output` support.
- Treat registry visibility and model visibility as different concepts.
- Add tests for both registry presence and model-filter visibility.
- Include subagents in permission tests.
- Prefer a shared helper for dynamic-tool default deny so primary agents and subagents cannot drift.
- Avoid manually adding every dynamic tool ID to every persona or subagent.
- Include dynamic tool lifecycle cleanup before considering the migration production-ready.
- Put dynamic tool selection guidance in skill content, but put skill-selection guidance in always-visible prompt text or skill descriptions.
- Keep learner-model free-text `"intent"` separate from removed runtime `Intent`.

## Gotchas

- `ToolRegistry.tools()` is not the same as "tools visible to the model"; model visibility also applies `Permission.disabled(...)`.
- Searching should not register dynamic tools in Buddy. Loading should register and grant them.
- Directly executing a tool in a unit test can bypass the model-loop visibility filter.
- Session permission allow works because session rules are merged after agent rules and last match wins.
- A wildcard deny can be overridden by a later specific session allow.
- A wildcard session allow for the whole namespace would defeat dynamic selection discipline.
- Directory-scoped registration means a tool searched in one session can appear in another session's raw registry list.
- Subagents do not automatically inherit primary persona permissions.
- If dynamic tools are not included in `allLearningToolIds()`, existing Buddy runtime permission overlays will not manage them unless a new dynamic policy is added.
- If dynamic tools are included in `allLearningToolIds()`, stale static permission derivation may accidentally advertise tools that should only be loaded dynamically.
- Prompt removal should not happen before dynamic skill/tool routing guidance is available somewhere always visible.

## Tests Added During Review

The following dynamic-tool regression tests should exist in `packages/buddy/test/learning/runtime-tool-registration.test.ts`:

- search returns candidates without exposing dynamic tools
- load exposes selected dynamic tools for the current session
- directory-visible dynamic tools are denied outside exact session grants
- dynamic load without a valid session does not register directory-visible tools
- dynamic grants are cleared and unregistered at the next Buddy turn boundary
- runtime subagents default-deny directory-registered dynamic tools

These tests confirm the intended primary-agent path and guard against the original subagent leakage gap.
