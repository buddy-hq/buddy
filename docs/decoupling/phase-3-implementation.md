# Phase 3 Implementation Plan: Dynamic Tools via Permission Toggling

> **Branch:** `decoupling`
> **Pre-work:** Phase 1 (SDK client + low-risk routes) ✅, Phase 2 (plugin tool shim) ✅
> **Goal:** Replace runtime `register/unregister` with pre-registered plugin tools + session permission toggling. Dynamic tools are always present in the registry; visibility is controlled by session permission rules.

## What Changes

Today:
```
grant → calls registerBuddyTools() → ToolRegistry.register() → tool added to registry
release → calls unregisterBuddyTools() → ToolRegistry.unregister() → tool removed from registry
```

After:
```
grant → writes session permission rule { permission: "tool_id", pattern: "*", action: "allow" }
release → removes session permission rule for that tool
```

Tools are always in the registry (Phase 2 plugin). They're just not visible/permitted until explicitly granted.

---

## Step 1: Default Dynamic Tools to Deny

### File: `packages/buddy/src/learning/agent-execution/permissions/session-permissions.ts`

The `buildBuddyRuntimeSessionPermissions()` function builds session permission rules from the teaching session runtime. It already has a concept of deny rules. We need to add deny rules for ALL dynamic tool IDs.

**Current code pattern** (at the end of the function):
```typescript
return [...preservedRules, ...allowRules, ...denyRules]
```

**Change:** Append `dynamicLearningToolDefaultDenyRules()` to the deny rules so every session starts with dynamic tools denied:

```typescript
import { dynamicLearningToolDefaultDenyRules } from "../../runtime/dynamic-tool-permissions"

// At the end of the function:
return [...preservedRules, ...allowRules, ...denyRules, ...dynamicLearningToolDefaultDenyRules()]
```

**Wait** — check if this is already there. Looking at the file on main, the function already calls:
```typescript
return [...preservedRules, ...allowRules, ...denyRules]
```

And `dynamic-tool-permissions.ts` already defines `dynamicLearningToolDefaultDenyRules()`. The function needs to append this to the ruleset.

**Verify:** Read the current `session-permissions.ts` and check if `dynamicLearningToolDefaultDenyRules()` is already appended. If not, add it.

### File: `packages/buddy/src/learning/agent-execution/permissions/runtime-session-permissions.ts`

The `syncBuddyRuntimeSessionPermissions()` function syncs permissions to the session. Verify it calls `buildBuddyRuntimeSessionPermissions()` which will now include dynamic tool denies.

**No change needed here** — the deny rules flow through naturally.

---

## Step 2: Make Granting a Dynamic Tool Update Session Permissions

### File: `packages/buddy/src/learning/runtime/dynamic-tool-grants.ts`

This is the main file that changes. The core functions:

#### `grantDynamicLearningToolsForSession()`

**Current:**
```typescript
export async function grantDynamicLearningToolsForSession(input): Promise<string[]> {
  // ... find tools ...
  const dynamicTools = ...
  const toolIDs = dynamicTools.map(tool => tool.id)

  // Update session permission + register tools
  const granted = await updateSessionPermission({ ... })
  if (!granted) return []

  await registerBuddyTools(input.directory, dynamicTools)
  return toolIDs
}
```

**New:** Remove `registerBuddyTools` call. The `updateSessionPermission` already writes the allow rule. No additional registration needed:

```typescript
export async function grantDynamicLearningToolsForSession(input): Promise<string[]> {
  const dynamicTools = ...
  const toolIDs = dynamicTools.map(tool => tool.id)

  const granted = await updateSessionPermission({
    directory: input.directory,
    sessionID: input.sessionID,
    update(permission) {
      return withDynamicLearningToolAllows({ existing: permission, toolIDs })
    },
  })
  if (!granted) return []

  return toolIDs
}
```

**Key question:** Does `updateSessionPermission` actually set the session permission? Check the implementation — it calls `Session.setPermission()` via `OpenCodeInstance.provide()`. This is the standard permission API. The plugin tools are already in the registry, so setting the permission to `allow` immediately enables them.

#### `releaseDynamicLearningToolsForSession()`

**Current:** Calls `updateSessionPermission` to remove allow rules, then calls `unregisterUnreferencedDynamicTools()` which calls `unregisterBuddyTools()`.

**New:** Only update permissions. Skip unregistration since tools stay in the registry:

```typescript
export async function releaseDynamicLearningToolsForSession(input): Promise<void> {
  searchCandidatesBySession.delete(grantKey(input.directory, input.sessionID))

  if (input.resetPermission) {
    await updateSessionPermission({
      directory: input.directory,
      sessionID: input.sessionID,
      update(permission) {
        const withoutDynamic = removeDynamicLearningToolSessionRules(permission)
        return [...withoutDynamic, ...dynamicLearningToolDefaultDenyRules()]
      },
    })
  }
  // No unregisterBuddyTools call
}
```

#### `ensureDynamicLearningToolsRegisteredForSession()`

**Current:** Calls `registerBuddyTools()` to make tools available.

**New:** Only syncs permissions. Tools are already in the registry:

```typescript
export async function ensureDynamicLearningToolsRegisteredForSession(input): Promise<string[]> {
  const toolIDs = await grantedDynamicLearningToolIDsForSession(input)
  const tools = grantedDynamicLearningTools(toolIDs)
  if (tools.length === 0) return []

  // No registerBuddyTools call — tools are pre-registered.
  // Just sync session permissions.
  await syncBuddyRuntimeSessionPermissions({
    directory: input.directory,
    sessionID: input.sessionID,
  })
  return tools.map(tool => tool.id)
}
```

---

## Step 3: Make `registerBuddyTools` a No-Op (Keep the Function, Empty the Body)

### File: `packages/buddy/src/learning/runtime/register-buddy-tools.ts`

Don't delete the function — other code paths may still call it. Make it a no-op with a comment:

```typescript
export async function registerBuddyTools(
  _directory: string,
  _tools: readonly BuddyTool[],
): Promise<void> {
  // Phase 3: Buddy tools are pre-registered via the plugin system.
  // Runtime registration is replaced by session permission toggling.
  // This function is kept as a no-op for backward compatibility during migration.
}

export async function unregisterBuddyTools(
  _directory: string,
  _toolIDs: readonly string[],
): Promise<void> {
  // Phase 3: Tools stay in the registry. Visibility is controlled by permissions.
  // This function is kept as a no-op for backward compatibility during migration.
}
```

### File: `packages/buddy/src/learning/runtime/register-tools.ts`

Same treatment:

```typescript
// Phase 3: Tools are pre-registered via the plugin system.
// Runtime registration is replaced by session permission toggling.
export async function registerRuntimeTools(
  _directory: string,
  _flags: ProxyRegistrationFlags,
  _toolToggles?: Config.Info["tools"],
): Promise<void> {
  // No-op during migration. Kept for backward compatibility.
}
```

---

## Step 4: Remove Proxy Registration Flags

### File: `packages/buddy/src/http/proxy/registration.ts`

The `registerOpenCodeTools()` function is called before proxy requests to ensure tools are registered. This is now unnecessary — tools are pre-registered:

```typescript
export async function registerOpenCodeTools(
  _directory: string,
  _flags: ProxyRegistrationFlags,
): Promise<void> {
  // Phase 3: Tools are pre-registered via the plugin system.
  // Proxy registration is no longer needed.
}
```

Don't delete the file — it's still imported by other proxy code. Just empty the body.

---

## Step 5: Verify Dynamic Tool Permissions Actually Control Visibility

### Check: OpenCode's tool filtering

OpenCode filters tools in `session/llm/request.ts`:
```
agent permission + session permission + user.tools
```

The session permission rules we're writing are the standard OpenCode permission format. They should be picked up by OpenCode's tool filter. Verify:

1. Grant a dynamic tool → session permission has `{ permission: "reflection", pattern: "*", action: "allow" }`
2. Tool appears in the model's available tool list
3. Tool is callable
4. Remove the grant → permission rule removed
5. Tool is no longer visible to the model
6. Tool call is denied

### File: `packages/buddy/test/learning/dynamic-tool-permission-toggle.test.ts` (NEW)

```typescript
import { afterEach, describe, expect, test } from "bun:test"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { SessionID } from "@buddy/opencode-adapter/id"
import { Session as OpenCodeSession } from "@buddy/opencode-adapter/session"
import { PermissionNext } from "@buddy/opencode-adapter/permission"
import { Config } from "@buddy/backend/config"
import { loadOpenCodeApp } from "../../src/opencode-runtime"
import { syncOpenCodeProjectConfig } from "../../src/config/runtime/opencode-sync"
import {
  readTeachingSessionState,
  writeTeachingSessionState,
} from "../../src/learning/agent-execution/state/session-state"
import { resolveSessionRuntime } from "../../src/learning/access/resolve-session-runtime"
import { REGISTERED_BUDDY_PERSONAS } from "../../src/learning/personas/registry"
import { getBuddyPersona } from "../../src/learning/personas/wiring/persona-profiles"
import { grantDynamicLearningToolsForSession } from "../../src/learning/runtime/dynamic-tool-grants"
import { dynamicReflectionTool } from "../../src/learning/features/teaching-guidance/tools/reflection"
import { tmpdir } from "../helpers/tmpdir"

const DYNAMIC_REFLECTION_TOOL_ID = dynamicReflectionTool.id

afterEach(async () => {
  await OpenCodeInstance.disposeAll()
})

describe("dynamic tool permission toggling", () => {
  test("granting a dynamic tool adds an allow rule to session permissions", async () => {
    await using project = await tmpdir({ git: true })
    await loadOpenCodeApp()
    await syncOpenCodeProjectConfig(project.path)

    const config = await Config.getProject(project.path)
    const persona = getBuddyPersona("buddy", config.personas)
    const definition = REGISTERED_BUDDY_PERSONAS.find(d => d.id === "buddy")!

    const sessionRuntime = resolveSessionRuntime({
      persona: { id: persona.id, features: definition.features, defaultSurface: persona.defaultSurface },
      teachingWorkspaceState: "inactive",
      configuredToolToggles: config.tools,
    })

    const sessionID = "ses_dynamic_toggle_test"
    writeTeachingSessionState(project.path, {
      sessionId: sessionID,
      persona: persona.id,
      currentSurface: persona.defaultSurface,
      teachingWorkspaceState: "inactive",
      sessionRuntime,
      focusGoalIds: [],
    })

    // Grant the dynamic tool
    const granted = await grantDynamicLearningToolsForSession({
      directory: project.path,
      sessionID,
      tools: [dynamicReflectionTool],
    })

    expect(granted).toEqual([DYNAMIC_REFLECTION_TOOL_ID])

    // Verify the tool is allowed in the teaching state
    const state = readTeachingSessionState(project.path, sessionID)
    expect(state?.sessionRuntime?.access.tools[DYNAMIC_REFLECTION_TOOL_ID]).toBe("allow")
  })

  test("dynamic tool is denied before granting and after releasing", async () => {
    await using project = await tmpdir({ git: true })
    await loadOpenCodeApp()
    await syncOpenCodeProjectConfig(project.path)

    const config = await Config.getProject(project.path)
    const persona = getBuddyPersona("buddy", config.personas)
    const definition = REGISTERED_BUDDY_PERSONAS.find(d => d.id === "buddy")!

    const sessionRuntime = resolveSessionRuntime({
      persona: { id: persona.id, features: definition.features, defaultSurface: persona.defaultSurface },
      teachingWorkspaceState: "inactive",
      configuredToolToggles: config.tools,
    })

    const sessionID = "ses_dynamic_deny_test"
    writeTeachingSessionState(project.path, {
      sessionId: sessionID,
      persona: persona.id,
      currentSurface: persona.defaultSurface,
      teachingWorkspaceState: "inactive",
      sessionRuntime,
      focusGoalIds: [],
    })

    // Before grant: tool should be denied
    let state = readTeachingSessionState(project.path, sessionID)
    expect(state?.sessionRuntime?.access.tools[DYNAMIC_REFLECTION_TOOL_ID] ?? "deny").toBe("deny")

    // Grant
    await grantDynamicLearningToolsForSession({
      directory: project.path,
      sessionID,
      tools: [dynamicReflectionTool],
    })

    state = readTeachingSessionState(project.path, sessionID)
    expect(state?.sessionRuntime?.access.tools[DYNAMIC_REFLECTION_TOOL_ID]).toBe("allow")

    // Release
    await import("../../src/learning/runtime/dynamic-tool-grants").then(m =>
      m.releaseDynamicLearningToolsForSession({
        directory: project.path,
        sessionID,
        resetPermission: true,
      }),
    )

    state = readTeachingSessionState(project.path, sessionID)
    expect(state?.sessionRuntime?.access.tools[DYNAMIC_REFLECTION_TOOL_ID] ?? "deny").toBe("deny")
  })

  test("registerBuddyTools is a no-op after migration", async () => {
    await using project = await tmpdir({ git: true })
    const { registerBuddyTools, unregisterBuddyTools } = await import(
      "../../src/learning/runtime/register-buddy-tools"
    )

    // These should not throw
    await registerBuddyTools(project.path, [])
    await unregisterBuddyTools(project.path, [])

    // Should not have registered any tools
    const toolIDs = await OpenCodeInstance.provide({
      directory: project.path,
      fn: () => import("@buddy/opencode-adapter/registry").then(m => m.ToolRegistry.ids()),
    })

    // Built-in tools should still be there (bash, read, etc.)
    expect(toolIDs).toContain("bash")
    expect(toolIDs).toContain("read")
  })
})
```

---

## Step 6: Update Dynamic Tool Permissions Module

### File: `packages/buddy/src/learning/runtime/dynamic-tool-permissions.ts`

Verify the helper functions are correct for the new model:

- `dynamicLearningToolDefaultDenyRules()` — returns deny rules for ALL dynamic tool IDs. These are appended to every session's initial permission ruleset.
- `isExactDynamicLearningToolAllowRule(rule)` — checks if a rule is an exact allow for a dynamic tool. Used to find already-granted tools.
- `removeDynamicLearningToolSessionRules(permission)` — removes dynamic tool rules from a ruleset. Used when releasing.

These should already be correct from the existing code. Verify they compile after the changes.

---

## Step 7: Remove `registerBuddyTools` Calls from Non-Dynamic Paths

### Search for remaining calls:

```bash
cd /Users/prashantbhudwal/Code/buddies/decoupling
rg "registerBuddyTools|registerRuntimeTools|unregisterBuddyTools" packages/buddy/src/ --no-heading
```

Replace any remaining non-test callers:
- `registerRuntimeTools()` in proxy code → no-op (Step 3/4)
- `registerBuddyTools()` in dynamic tool grants → removed (Step 2)
- Any other callers → evaluate case by case

---

## Step 8: Integration Test — Full Dynamic Tool Lifecycle

### File: `packages/buddy/test/learning/dynamic-tool-end-to-end.test.ts` (NEW)

```typescript
import { afterEach, describe, expect, test } from "bun:test"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { SessionID } from "@buddy/opencode-adapter/id"
import { ToolRegistry } from "@buddy/opencode-adapter/registry"
import { Session as OpenCodeSession } from "@buddy/opencode-adapter/session"
import { Config } from "@buddy/backend/config"
import { loadOpenCodeApp } from "../../src/opencode-runtime"
import { syncOpenCodeProjectConfig } from "../../src/config/runtime/opencode-sync"
import {
  writeTeachingSessionState,
} from "../../src/learning/agent-execution/state/session-state"
import { resolveSessionRuntime } from "../../src/learning/access/resolve-session-runtime"
import { REGISTERED_BUDDY_PERSONAS } from "../../src/learning/personas/registry"
import { getBuddyPersona } from "../../src/learning/personas/wiring/persona-profiles"
import { grantDynamicLearningToolsForSession } from "../../src/learning/runtime/dynamic-tool-grants"
import { releaseDynamicLearningToolsForSession } from "../../src/learning/runtime/dynamic-tool-grants"
import { dynamicReflectionTool } from "../../src/learning/features/teaching-guidance/tools/reflection"
import { tmpdir } from "../helpers/tmpdir"

afterEach(async () => {
  await OpenCodeInstance.disposeAll()
})

describe("dynamic tool end-to-end", () => {
  test("pre-registered plugin tool becomes callable after permission grant", async () => {
    await using project = await tmpdir({ git: true })
    await loadOpenCodeApp()
    await syncOpenCodeProjectConfig(project.path)

    // Verify the tool is in the registry (pre-registered by Phase 2 plugin)
    const allToolIDs = await OpenCodeInstance.provide({
      directory: project.path,
      fn: () => ToolRegistry.ids(),
    })
    expect(allToolIDs).toContain(dynamicReflectionTool.id)

    // Create a session and seed teaching state
    const session = await OpenCodeInstance.provide({
      directory: project.path,
      fn: () => OpenCodeSession.create({ title: "Dynamic tool test" }),
    })

    const config = await Config.getProject(project.path)
    const persona = getBuddyPersona("buddy", config.personas)
    const definition = REGISTERED_BUDDY_PERSONAS.find(d => d.id === "buddy")!
    const sessionRuntime = resolveSessionRuntime({
      persona: { id: persona.id, features: definition.features, defaultSurface: persona.defaultSurface },
      teachingWorkspaceState: "inactive",
      configuredToolToggles: config.tools,
    })

    writeTeachingSessionState(project.path, {
      sessionId: session.id,
      persona: persona.id,
      currentSurface: persona.defaultSurface,
      teachingWorkspaceState: "inactive",
      sessionRuntime,
      focusGoalIds: [],
    })

    // Grant the dynamic tool
    await grantDynamicLearningToolsForSession({
      directory: project.path,
      sessionID: session.id,
      tools: [dynamicReflectionTool],
    })

    // Verify session permission now allows the tool
    const updatedSession = await OpenCodeInstance.provide({
      directory: project.path,
      fn: () => OpenCodeSession.get(SessionID.make(session.id)),
    })

    const hasAllow = updatedSession.permission?.some(
      rule => rule.permission === dynamicReflectionTool.id && rule.action === "allow"
    )
    expect(hasAllow).toBe(true)

    // Release
    await releaseDynamicLearningToolsForSession({
      directory: project.path,
      sessionID: session.id,
      resetPermission: true,
    })

    // Verify permission removed
    const releasedSession = await OpenCodeInstance.provide({
      directory: project.path,
      fn: () => OpenCodeSession.get(SessionID.make(session.id)),
    })

    const stillAllowed = releasedSession.permission?.some(
      rule => rule.permission === dynamicReflectionTool.id && rule.action === "allow"
    )
    expect(stillAllowed).toBe(false)

    // Tool should still be in the registry (pre-registered, not unregistered)
    const finalToolIDs = await OpenCodeInstance.provide({
      directory: project.path,
      fn: () => ToolRegistry.ids(),
    })
    expect(finalToolIDs).toContain(dynamicReflectionTool.id)
  }, 30_000)
})
```

---

## Verification Checklist

```bash
cd /Users/prashantbhudwal/Code/buddies/decoupling

# Typecheck
bun typecheck

# All existing tests
bun run --cwd packages/buddy test:contracts

# Dynamic tool tests
bun run --cwd packages/buddy test dynamic-tool-permission-toggle
bun run --cwd packages/buddy test dynamic-tool-end-to-end

# Verify no registerBuddyTools calls remain in non-test code
rg "registerBuddyTools|unregisterBuddyTools|registerRuntimeTools" packages/buddy/src/ --no-heading | grep -v ".test."
# Expected: only no-op function bodies, no active calls

# Verify dynamicLearningToolDefaultDenyRules is in the permission ruleset
rg "dynamicLearningToolDefaultDenyRules" packages/buddy/src/ --no-heading
```

---

## What NOT to Do in Phase 3

- **Do NOT delete `registerBuddyTools` or `unregisterBuddyTools`.** Make them no-ops. Some code paths may still reference them.
- **Do NOT change tool implementations.** Tools are unchanged.
- **Do NOT change the plugin file** from Phase 2. It already exports all tools including dynamic ones.
- **Do NOT remove proxy registration code** from non-dynamic paths yet. The proxy layer is removed in Phase 7.

---

## Deliverable

Branch `decoupling` with:
1. Modified: `session-permissions.ts` — append `dynamicLearningToolDefaultDenyRules()` to all session permission rulesets
2. Modified: `dynamic-tool-grants.ts` — remove `registerBuddyTools`/`unregisterBuddyTools` calls
3. Modified: `register-buddy-tools.ts` — no-op bodies with migration comments
4. Modified: `register-tools.ts` — no-op body with migration comment
5. Modified: `proxy/registration.ts` — no-op `registerOpenCodeTools` body
6. New test: `dynamic-tool-permission-toggle.test.ts` — grant/deny/release cycle
7. New test: `dynamic-tool-end-to-end.test.ts` — full lifecycle with session permission verification
8. All existing tests passing
9. `rg "registerBuddyTools\(|unregisterBuddyTools\(|registerRuntimeTools\(" packages/buddy/src/` shows only no-op definitions
