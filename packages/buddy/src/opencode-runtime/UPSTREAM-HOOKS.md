# Upstream OpenCode Hooks Needed

This file documents OpenCode plugin hooks that Buddy currently patches around because they do not exist. Each entry describes what Buddy needs and what upstream hook would replace the current adapter patch.

## 1. Child session spawn hook

**Buddy need:** When OpenCode creates a child session (for subagents or task delegation), Buddy must inject custom tool overrides, permission rules, and teaching state before the child session processes its first prompt.

**Current workaround:** `subagent-forwarding.ts` intercepts two points:

- `SessionPrompt.registerPromptInputInterceptor` for direct delegate prompts
- `ToolRegistry.registerToolDefTransformer` for task tool child prompts

Both wrap internal `promptOps.prompt()` to run `withSubagentToolForwarding()` before the prompt reaches the agent loop.

**Desired upstream hook:**

```typescript
"session.subagent.spawn"?: (
  input: { parentSessionID: string; childSessionID: string; agent: string },
  output: { tools: Record<string, boolean>; permission: PermissionRuleset },
) => Promise<void>
```

**Status:** Not available. Watching OpenCode releases.

## 2. Skill visibility filter hook

**Buddy need:** Hide specific built-in OpenCode skills (for example `customize-opencode`) from the skill list and agent available skills.

**Current workaround:** `skill-filtering.ts` calls `setSkillVisibilityFilter()` on the `@buddy/opencode-adapter/skill-live` monkey-patch.

**Desired upstream hook:**

```typescript
"skill.visibility"?: (
  input: { name: string; location: string },
  output: { visible: boolean },
) => Promise<void>
```

**Status:** Not available. Could potentially be replaced by config-level skill path filtering without a hook.

## 3. Pre-prompt input transform hook

**Buddy need:** Modify prompt input (agent, model, tools, system prompt) before the agent loop resolves agent/config. Buddy currently does this in `message-prompt-pipeline.ts` on the Hono side.

**Current workaround:** Buddy runs the prompt pipeline in Hono before sending to OpenCode via the SDK. This works but prevents the plugin from seeing the transformed prompt.

**Desired upstream hook:**

```typescript
"chat.prompt.transform"?: (
  input: { sessionID: string; body: PromptBody },
  output: { body: PromptBody },
) => Promise<void>
```

**Status:** Not available. Current Hono-side pipeline is functional.
