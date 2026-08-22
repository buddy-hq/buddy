# Phase 2 Implementation Plan: Shim-Based Tool Migration

> **Branch:** `decoupling`
> **Worktree:** `/Users/prashantbhudwal/Code/buddies/decoupling`
> **Pre-work:** Phase 1 (SDK client + low-risk routes) is complete
> **Goal:** Make Buddy tools loadable through OpenCode's plugin tool system using a shim that bridges `BuddyTool` ↔ plugin `ToolDefinition`. Keep existing `registerBuddyTools` path working alongside.

## Context

OpenCode discovers tools through three paths. We'll use path #2:

1. **Built-in** — hardcoded in `tool/registry.ts` (bash, read, write, etc.)
2. **File-based** — `.js`/`.ts` files in `{tool,tools}/` directories within config dirs. Auto-discovered.
3. **Plugin-based** — plugins export `tool: Record<string, ToolDefinition>`. Loaded via config overlay `plugin: [...]`.

The system prompt guard already uses path #3. We'll follow the same pattern for Buddy tools.

## Step 1: Create the Tool Shim

### File: `packages/buddy/src/opencode-runtime/buddy-tool-shim.ts` (NEW)

This file converts a `BuddyTool` into a plugin-compatible `ToolDefinition`. It handles context bridging (plugin `ToolContext` → `BuddyToolContext`) and Zod schema extraction.

```typescript
import type { ToolDefinition, ToolContext, ToolResult } from "@opencode-ai/plugin"
import z from "zod"
import type { BuddyTool, BuddyToolContext } from "../learning/runtime/create-buddy-tool"

/**
 * Extracts a ZodRawShape from a BuddyTool's parameters.
 * Most Buddy tools use z.object({...}). For tools that use other Zod types
 * (z.string(), z.union(), etc.), wraps them in { input: schema }.
 */
function extractZodShape(parameters: z.ZodType): z.ZodRawShape {
  if (parameters instanceof z.ZodObject) {
    return { ...parameters.shape } as z.ZodRawShape
  }

  // Non-object schemas: wrap in { input: schema }
  return { input: parameters }
}

/**
 * Bridges the plugin ToolContext to Buddy's BuddyToolContext.
 *
 * Key mappings:
 * - pluginCtx.sessionID → buddyCtx.sessionID
 * - pluginCtx.messageID → buddyCtx.messageID
 * - pluginCtx.agent     → buddyCtx.agent
 * - pluginCtx.abort     → buddyCtx.abort (AbortSignal)
 * - pluginCtx.directory → buddyCtx.directory
 * - pluginCtx.metadata  → buddyCtx.metadata (pass-through)
 * - pluginCtx.ask       → buddyCtx.ask (pass-through, both are Promise-based)
 *
 * Fields NOT available from plugin context (set to defaults):
 * - callID  → undefined
 * - extra   → undefined
 * - messages → []
 */
function bridgeContext(pluginCtx: ToolContext, directory: string): BuddyToolContext {
  return {
    directory,
    sessionID: pluginCtx.sessionID,
    messageID: pluginCtx.messageID,
    agent: pluginCtx.agent,
    abort: pluginCtx.abort,
    callID: undefined,
    extra: undefined,
    messages: [],
    metadata: async (input) => {
      pluginCtx.metadata({
        title: input.title,
        metadata: input.metadata,
      })
    },
    ask: async (input) => {
      await pluginCtx.ask({
        permission: input.permission,
        patterns: [...input.patterns],
        always: [...(input.always ?? [])],
        metadata: input.metadata ?? {},
      })
    },
  }
}

/**
 * Converts a BuddyTool to a plugin ToolDefinition.
 *
 * The returned definition can be exported from a plugin file or placed
 * in a tool/ directory for OpenCode to auto-discover.
 *
 * Note on Zod validation: BuddyTool.execute does its own Zod validation
 * inside the tool. The plugin's args shape is used by OpenCode for LLM
 * schema generation only. Actual validation happens in the execute wrapper below.
 */
export function buddyToolToPluginTool(tool: BuddyTool, directory: string): ToolDefinition {
  return {
    description: tool.description,
    args: extractZodShape(tool.parameters),

    async execute(rawArgs: unknown, pluginCtx: ToolContext): Promise<ToolResult> {
      const buddyCtx = bridgeContext(pluginCtx, directory)

      // BuddyTool.execute does its own Zod validation via safeParse.
      // We pass rawArgs through — the tool handles validation internally.
      const result = await tool.execute(rawArgs as any, buddyCtx)

      return {
        title: result.title ?? tool.id,
        output: result.output,
        metadata: result.metadata ?? {},
      }
    },
  } satisfies ToolDefinition
}

/**
 * Converts all Buddy tools to plugin ToolDefinitions.
 * Uses allBuddyTools() to get the canonical tool list.
 */
export async function allBuddyPluginTools(directory: string): Promise<ToolDefinition[]> {
  const { allBuddyTools } = await import("../learning/runtime/feature-registry")
  return allBuddyTools().map((tool) => buddyToolToPluginTool(tool, directory))
}
```

### Verification

After creating this file:

```bash
cd /Users/prashantbhudwal/Code/buddies/decoupling
bun typecheck
```

Expected: compiles cleanly. `BuddyTool` and `ToolDefinition` types should be compatible at the shim boundary.

---

## Step 2: Create the Buddy Runtime Plugin

### File: `packages/buddy/src/opencode-runtime/plugins/buddy-runtime-plugin.ts` (NEW)

This is the plugin file that OpenCode loads via config overlay. It exports a `server` function (the plugin entry point) that returns `Hooks` with `tool` definitions.

```typescript
import type { Plugin, Hooks } from "@opencode-ai/plugin"
import { allBuddyPluginTools } from "../buddy-tool-shim"
import { captureSessionSystemPrompt } from "../system-prompt-capture"

// Re-use the system prompt guard logic from the existing plugin.
// In a later phase this gets consolidated. For now, keep both plugins
// separate and add tools to this one.

type PluginInput = {
  directory: string
  worktree: string
}

type SystemTransformInput = {
  sessionID?: string
}

type SystemTransformOutput = {
  system: string[]
}

// Buddy tools needed at plugin construction time.
// Static import avoids dynamic import overhead at instance init.
import { allBuddyTools } from "../../learning/runtime/feature-registry"

const plugin: Plugin = async (input: PluginInput): Promise<Hooks> => {
  const directory = input.directory

  // Build tool map from all Buddy tools
  const tools = allBuddyTools()
  const toolMap: Record<string, any> = {}

  for (const tool of tools) {
    const { buddyToolToPluginTool } = await import("../buddy-tool-shim")
    toolMap[tool.id] = buddyToolToPluginTool(tool, directory)
  }

  return {
    tool: toolMap,
  }
}

export default plugin
```

Wait — there's a problem. `allBuddyTools()` imports from `feature-registry` which pulls in the entire Buddy learning runtime. This would cause circular imports or heavy initialization inside the plugin file.

**Better approach:** Don't import `allBuddyTools()` directly in the plugin file. Instead, create the tool map at config overlay build time (when `buildOpenCodeConfigOverlay` runs) and write a static plugin file.

Actually, the simplest approach for Phase 2 is to **write tool files to a config directory** rather than using the plugin system. This avoids the plugin loading complexity (circular imports, dynamic import issues) while still getting tools into OpenCode's tool registry.

---

## Revised Step 2: Write Tools to a Config Directory

### Approach: File-based tool discovery

OpenCode scans `{tool,tools}/*.{js,ts}` in config directories. We'll write a single tools file to the global Buddy config directory during bootstrap.

### File: `packages/buddy/src/opencode-runtime/write-buddy-tool-file.ts` (NEW)

```typescript
import fs from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"

const BUDDY_TOOLS_FILENAME = "buddy-tools.ts"
const TOOLS_DIRNAME = "tools"

/**
 * Returns the path where the Buddy tools file should be written.
 * Uses the same config directory that OpenCode reads for tool discovery.
 */
function buddyToolsFilePath(configDir: string): string {
  return path.join(configDir, TOOLS_DIRNAME, BUDDY_TOOLS_FILENAME)
}

/**
 * Generates the content of the tools file. Each Buddy tool is exported
 * as a named export matching its tool ID.
 *
 * The file uses the buddyToolToPluginTool shim to convert each tool.
 * Tool descriptions and Zod schemas are inlined at generation time.
 */
export async function generateBuddyToolsFile(configDir: string): Promise<string> {
  const { allBuddyTools } = await import("../learning/runtime/feature-registry")
  const { buddyToolToPluginTool } = await import("./buddy-tool-shim")

  const tools = allBuddyTools()
  const directory = configDir // tools use config dir as their "directory" context

  const toolExports = tools
    .map((tool) => {
      const pluginTool = buddyToolToPluginTool(tool, directory)
      const description = JSON.stringify(pluginTool.description)
      const argsSource = zodShapeToSource(pluginTool.args)

      return [
        `// ${tool.id}`,
        `export const ${safeExportName(tool.id)} = {`,
        `  description: ${description},`,
        `  args: ${argsSource},`,
        `  async execute(args, ctx) {`,
        `    const { execute_${safeExportName(tool.id)} } = await import("./buddy-tool-shim");`,
        `    return execute_${safeExportName(tool.id)}(args, ctx);`,
        `  },`,
        `};`,
      ].join("\n")
    })
    .join("\n\n")

  return [
    `// Generated by Buddy — do not edit.`,
    `// Regenerate with: bun run buddy:generate-tools`,
    `import z from "zod";`,
    ``,
    `// Dynamic import of the shim for lazy loading.`,
    `// The shim handles context bridging and validation.`,
    `const shimPromise = import("./buddy-tool-shim");`,
    ``,
    toolExports,
    ``,
  ].join("\n")
}

/**
 * Writes the generated tools file to disk and ensures the parent directory exists.
 */
export async function writeBuddyToolsFile(configDir: string): Promise<void> {
  const filepath = buddyToolsFilePath(configDir)
  fs.mkdirSync(path.dirname(filepath), { recursive: true })

  const content = await generateBuddyToolsFile(configDir)
  fs.writeFileSync(filepath, content, "utf8")
}

/**
 * Returns the file:// URL for loading the tools file as a module.
 */
export function buddyToolsFileUrl(configDir: string): string {
  return pathToFileURL(buddyToolsFilePath(configDir)).href
}

// -- Helpers --

const SAFE_EXPORT_RE = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/

function safeExportName(toolID: string): string {
  // Replace hyphens with underscores, prefix with _ if starts with digit
  const sanitized = toolID.replaceAll("-", "_")
  if (/^[0-9]/.test(sanitized)) return `_${sanitized}`
  if (!SAFE_EXPORT_RE.test(sanitized)) return `tool_${toolID.replaceAll(/[^a-zA-Z0-9_$]/g, "_")}`
  return sanitized
}

function zodShapeToSource(shape: Record<string, unknown>): string {
  // Simple serialization: just pass the shape object.
  // In production, use a proper Zod-to-source serializer.
  // For Phase 2, we serialize the shape as a JSON object literal
  // and reconstruct Zod types at import time.
  const entries = Object.entries(shape).map(([key, schema]) => {
    return `${JSON.stringify(key)}: z.${describeZodType(schema)}`
  })
  return `{ ${entries.join(", ")} }`
}

function describeZodType(schema: unknown): string {
  // Simplified: most Buddy tools use z.string(), z.number(), z.boolean(),
  // z.object({...}), z.array(...), z.enum([...]), z.optional(...)
  // For Phase 2, use a runtime approach instead of source generation.
  return "unknown()" // Placeholder — see note below
}
```

**Note on `zodShapeToSource`:** Generating valid Zod source code from runtime Zod objects is complex. For Phase 2, we'll use a different approach — instead of generating a source file, we'll write a JSON representation of the tool schemas and use the shim to reconstruct them at load time.

---

## Revised Revised Step 2: Runtime Tool File (Simpler)

The source generation approach is fragile. Instead, write a simple JS file that imports the shim at runtime. The shim already has access to `allBuddyTools()`.

### File: `packages/buddy/src/opencode-runtime/tools/buddy-tools.ts` (NEW)

```typescript
/**
 * Buddy tool definitions for OpenCode's file-based tool discovery.
 *
 * OpenCode scans {tool,tools}/*.{js,ts} in config directories.
 * This file re-exports all Buddy tools as plugin ToolDefinitions
 * using the buddyToolToPluginTool shim.
 *
 * The shim is dynamically imported to avoid bundling the full
 * Buddy learning runtime into this file at parse time.
 */

import type { ToolDefinition } from "@opencode-ai/plugin"

let toolsPromise: Promise<Record<string, ToolDefinition>> | undefined

async function loadTools(): Promise<Record<string, ToolDefinition>> {
  const { allBuddyTools } = await import("../../learning/runtime/feature-registry")
  const { buddyToolToPluginTool } = await import("../buddy-tool-shim")

  const tools = allBuddyTools()
  const directory = "" // filled by OpenCode's tool context at execution time

  const map: Record<string, ToolDefinition> = {}
  for (const tool of tools) {
    map[tool.id] = buddyToolToPluginTool(tool, directory)
  }
  return map
}

function getTools(): Promise<Record<string, ToolDefinition>> {
  if (!toolsPromise) {
    toolsPromise = loadTools()
  }
  return toolsPromise
}

// Proxy that lazily resolves each tool on first access.
// OpenCode iterates Object.entries() on the module exports,
// so each export must be a ToolDefinition (or at least pass isPluginTool()).
//
// We use a Proxy to defer tool resolution until the tool is actually
// loaded by OpenCode's registry.
const toolsProxy = new Proxy({} as Record<string, ToolDefinition>, {
  get(_target, prop) {
    if (typeof prop !== "string") return undefined
    return createLazyToolDef(prop)
  },
  ownKeys() {
    // Return allBuddyTools IDs synchronously so Object.entries works.
    // This requires a synchronous import of the tool ID list.
    return getToolIDs()
  },
  getOwnPropertyDescriptor() {
    return { configurable: true, enumerable: true }
  },
})

function getToolIDs(): string[] {
  // Static list is fine for Phase 2 — tools don't change at runtime.
  // We can use a require() or a known list.
  try {
    const { allBuddyTools } = require("../../learning/runtime/feature-registry") as any
    return allBuddyTools().map((t: any) => t.id)
  } catch {
    return []
  }
}

function createLazyToolDef(toolID: string): ToolDefinition {
  // Return a placeholder ToolDefinition that passes isPluginTool()
  // and defers to the real implementation at execution time.
  return {
    description: `Buddy tool: ${toolID}`,
    args: {},
    async execute(args: unknown, ctx: any): Promise<any> {
      const tools = await getTools()
      const tool = tools[toolID]
      if (!tool) throw new Error(`Buddy tool not found: ${toolID}`)
      return tool.execute(args, ctx)
    },
  }
}

// Export the proxy so OpenCode sees all tools via Object.entries()
export default toolsProxy

// Also export individual named tools for direct access
// These are populated by the proxy
```

**This is too clever.** Let me go with the simplest possible approach that works.

---

## Final Step 2: Direct Tool Registration via Plugin

The simplest approach: use OpenCode's existing plugin loading mechanism exactly as the system prompt guard does.

### The Plugin Loading Chain

```
1. buildOpenCodeConfigOverlay() runs
2. resolveBuddySystemPromptGuardPluginUrl() finds plugin file
3. plugin URL added to config overlay: { plugin: [pluginUrl] }
4. OpenCode's plugin loader loads the plugin file
5. Plugin's server() function runs, returns Hooks
6. Hooks.tool entries registered by tool registry
```

We add a SECOND plugin URL for Buddy tools.

### File: `packages/buddy/src/opencode-runtime/buddy-tools-plugin.ts` (NEW)

```typescript
import fs from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"

const PLUGIN_BASENAME = "buddy-tools-plugin"
const PLUGIN_DIR = "plugins"

function resolvePluginPathCandidate(filename: string) {
  return path.resolve(import.meta.dir, PLUGIN_DIR, filename)
}

export function resolveBuddyToolsPluginUrl() {
  const candidates = [
    resolvePluginPathCandidate(`${PLUGIN_BASENAME}.js`),
    resolvePluginPathCandidate(`${PLUGIN_BASENAME}.ts`),
  ]

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return pathToFileURL(candidate).href
    }
  }

  return undefined
}
```

### File: `packages/buddy/src/opencode-runtime/plugins/buddy-tools-plugin.ts` (NEW)

```typescript
import type { Plugin } from "@opencode-ai/plugin"

type PluginInput = {
  directory: string
  worktree: string
}

const plugin: Plugin = async (input: PluginInput) => {
  const directory = input.directory

  // Dynamic import to avoid bundling the full learning runtime
  // until the plugin is actually loaded by OpenCode.
  const { allBuddyTools } = await import("../../learning/runtime/feature-registry")
  const { buddyToolToPluginTool } = await import("../buddy-tool-shim")

  const tools = allBuddyTools()
  const toolMap: Record<string, any> = {}

  for (const tool of tools) {
    toolMap[tool.id] = buddyToolToPluginTool(tool, directory)
  }

  return { tool: toolMap }
}

export default plugin
```

### Modify: `packages/buddy/src/config/opencode/overlay-builder.ts`

Add the tools plugin URL alongside the existing system prompt guard:

```typescript
// Existing line:
const systemPromptGuardPlugin = resolveBuddySystemPromptGuardPluginUrl()

// Add:
import { resolveBuddyToolsPluginUrl } from "../../opencode-runtime/buddy-tools-plugin"
const buddyToolsPlugin = resolveBuddyToolsPluginUrl()

// Existing line (approximately line 95):
...(systemPromptGuardPlugin ? { plugin: [systemPromptGuardPlugin] } : {}),

// Change to:
...(systemPromptGuardPlugin || buddyToolsPlugin
  ? {
      plugin: [
        ...(systemPromptGuardPlugin ? [systemPromptGuardPlugin] : []),
        ...(buddyToolsPlugin ? [buddyToolsPlugin] : []),
      ],
    }
  : {}),
```

### Modify: `packages/buddy/script/build-compiled-binary.ts`

The build script already copies `opencode-runtime/plugins/` to the bundle output. The new plugin file `buddy-tools-plugin.ts` will be picked up automatically since it's in the same directory. No build script change needed.

### Verification

```bash
bun typecheck
```

---

## Step 3: Add a Smoke Test

### File: `packages/buddy/test/opencode-runtime/buddy-tool-shim.test.ts` (NEW)

```typescript
import { describe, expect, test } from "bun:test"
import z from "zod"
import { createBuddyTool } from "../../src/learning/runtime/create-buddy-tool"
import { buddyToolToPluginTool } from "../../src/opencode-runtime/buddy-tool-shim"

describe("buddyToolToPluginTool shim", () => {
  test("extracts Zod object shape from Buddy tool parameters", () => {
    const tool = createBuddyTool({
      id: "test_tool",
      description: "A test tool",
      parameters: z.object({
        input: z.string(),
        count: z.number(),
      }),
      async execute(args, _ctx) {
        return { output: `${args.input}:${args.count}` }
      },
    })

    const pluginTool = buddyToolToPluginTool(tool, "/tmp/test")

    expect(pluginTool.description).toBe("A test tool")
    expect(pluginTool.args).toHaveProperty("input")
    expect(pluginTool.args).toHaveProperty("count")
    expect(typeof pluginTool.execute).toBe("function")
  })

  test("converts non-object Zod schemas to { input: schema } shape", () => {
    const tool = createBuddyTool({
      id: "string_tool",
      description: "Takes a string",
      parameters: z.string(),
      async execute(args, _ctx) {
        return { output: args }
      },
    })

    const pluginTool = buddyToolToPluginTool(tool, "/tmp/test")
    expect(pluginTool.args).toHaveProperty("input")
  })

  test("executes a Buddy tool through the plugin interface", async () => {
    const tool = createBuddyTool({
      id: "exec_test",
      description: "Execution test",
      parameters: z.object({ name: z.string() }),
      async execute(args, _ctx) {
        return { output: `hello ${args.name}` }
      },
    })

    const pluginTool = buddyToolToPluginTool(tool, "/tmp/test")
    const result = await pluginTool.execute(
      { name: "world" },
      {
        sessionID: "ses_test",
        messageID: "msg_test",
        agent: "buddy",
        directory: "/tmp/test",
        worktree: "/tmp/test",
        abort: new AbortController().signal,
        metadata(_input) {},
        ask: async (_input) => {},
      },
    )

    expect(result.output).toBe("hello world")
    expect(typeof result.title).toBe("string")
  })

  test("metadata updates are forwarded through the shim", async () => {
    const updates: Array<{ title?: string }> = []

    const tool = createBuddyTool({
      id: "meta_test",
      description: "Metadata test",
      parameters: z.object({}),
      async execute(_args, ctx) {
        await ctx.metadata({ title: "working", metadata: { phase: 1 } })
        return { title: "done", output: "ok", metadata: { phase: 2 } }
      },
    })

    const pluginTool = buddyToolToPluginTool(tool, "/tmp/test")
    const result = await pluginTool.execute(
      {},
      {
        sessionID: "ses_test",
        messageID: "msg_test",
        agent: "buddy",
        directory: "/tmp/test",
        worktree: "/tmp/test",
        abort: new AbortController().signal,
        metadata(input) {
          updates.push(input)
        },
        ask: async (_input) => {},
      },
    )

    expect(updates).toEqual([
      { title: "working", metadata: { phase: 1 } },
    ])
    expect(result.metadata).toEqual({ phase: 2 })
  })
})
```

---

## Step 4: Wire Config Overlay to Load Both Plugins

### File: `packages/buddy/src/config/opencode/overlay-builder.ts`

**Change 1:** Add import at top:
```typescript
import { resolveBuddyToolsPluginUrl } from "../../opencode-runtime/buddy-tools-plugin"
```

**Change 2:** In `buildOpenCodeConfigOverlay()`, find the line:
```typescript
const systemPromptGuardPlugin = resolveBuddySystemPromptGuardPluginUrl()
```

Add below it:
```typescript
const buddyToolsPlugin = resolveBuddyToolsPluginUrl()
```

**Change 3:** Find the line (approximately line 95):
```typescript
...(systemPromptGuardPlugin ? { plugin: [systemPromptGuardPlugin] } : {}),
```

Replace with:
```typescript
...(systemPromptGuardPlugin || buddyToolsPlugin
  ? {
      plugin: [
        ...(systemPromptGuardPlugin ? [systemPromptGuardPlugin] : []),
        ...(buddyToolsPlugin ? [buddyToolsPlugin] : []),
      ],
    }
  : {}),
```

---

## Step 5: Integration Test — Tools Appear in Registry

### File: `packages/buddy/test/opencode-runtime/buddy-tools-plugin.test.ts` (NEW)

```typescript
import { describe, expect, test } from "bun:test"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { ToolRegistry } from "@buddy/opencode-adapter/registry"
import { Config } from "@buddy/backend/config"
import { syncOpenCodeProjectConfig } from "../../src/config/runtime/opencode-sync"
import { loadOpenCodeApp } from "../../src/opencode-runtime"
import { tmpdir } from "../helpers/tmpdir"

describe("Buddy tools plugin", () => {
  test("Buddy tools appear in OpenCode tool registry after config sync", async () => {
    await using project = await tmpdir({ git: true })

    await loadOpenCodeApp()
    await syncOpenCodeProjectConfig(project.path)

    const toolIDs = await OpenCodeInstance.provide({
      directory: project.path,
      fn: () => ToolRegistry.ids(),
    })

    // Buddy tools should be registered
    expect(toolIDs).toContain("save_flashcard_deck")
    expect(toolIDs).toContain("ingest_full_text")
    expect(toolIDs).toContain("prepare_resource")
    expect(toolIDs).toContain("render_mermaid")
    expect(toolIDs).toContain("render_figure")
  }, 30_000)

  test("Buddy tools can be executed through the plugin path", async () => {
    await using project = await tmpdir({ git: true })

    await loadOpenCodeApp()
    await syncOpenCodeProjectConfig(project.path)

    const tools = await OpenCodeInstance.provide({
      directory: project.path,
      fn: () => ToolRegistry.tools({
        providerID: "opencode" as any,
        modelID: "claude-sonnet" as any,
        agent: { name: "buddy", mode: "primary", permission: [] } as any,
      }),
    })

    const ingestTool = tools.find((t: any) => t.id === "prepare_resource")
    expect(ingestTool).toBeDefined()
  }, 30_000)
})
```

---

## What NOT to Do in Phase 2

- **Do NOT remove `registerBuddyTools`.** Both paths should coexist. Existing code that calls `registerBuddyTools()` continues to work.
- **Do NOT change `createBuddyTool`.** The shim wraps existing tools. No modifications to the tool factory.
- **Do NOT change the config overlay structure.** Add the new plugin URL alongside the existing one. Don't restructure.
- **Do NOT change any tool implementations.** Tools are unchanged. Only their registration mechanism gets a second path.

---

## Verification Checklist

```bash
cd /Users/prashantbhudwal/Code/buddies/decoupling

# Basic checks
bun typecheck
bun lint

# Shim unit tests
bun run --cwd packages/buddy test buddy-tool-shim

# Plugin integration test
bun run --cwd packages/buddy test buddy-tools-plugin

# Existing tests still pass (regression guard)
bun run --cwd packages/buddy test:contracts

# Verify both plugin files exist in plugins directory
ls packages/buddy/src/opencode-runtime/plugins/
# Expected: buddy-system-prompt-guard.ts AND buddy-tools-plugin.ts
```

---

## Deliverable

Branch `decoupling` with:
1. New file: `packages/buddy/src/opencode-runtime/buddy-tool-shim.ts` (the converter)
2. New file: `packages/buddy/src/opencode-runtime/buddy-tools-plugin.ts` (URL resolver)
3. New file: `packages/buddy/src/opencode-runtime/plugins/buddy-tools-plugin.ts` (plugin entry)
4. Modified file: `packages/buddy/src/config/opencode/overlay-builder.ts` (add second plugin URL)
5. New test: `packages/buddy/test/opencode-runtime/buddy-tool-shim.test.ts`
6. New test: `packages/buddy/test/opencode-runtime/buddy-tools-plugin.test.ts`
7. All existing tests passing
8. `registerBuddyTools()` still works alongside plugin tools
