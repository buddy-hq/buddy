import { afterEach, describe, expect, test } from "bun:test"
import path from "node:path"
import { writeFileSync } from "node:fs"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { ToolRegistry } from "@buddy/opencode-adapter/registry"
import { syncOpenCodeProjectConfig } from "../src/config/runtime/opencode-sync"
import { buildBuddyRuntimeSessionPermissions } from "../src/learning/agent-execution/permissions/session-permissions"
import { resolveSessionRuntime } from "../src/learning/access/resolve-session-runtime"
import { REGISTERED_BUDDY_PERSONAS } from "../src/learning/personas/registry"
import { getBuddyPersona } from "../src/learning/personas/wiring/persona-profiles"
import { fetchInProcessOpenCode, loadOpenCodeApp } from "../src/opencode-runtime"
import { tmpdir } from "./helpers/tmpdir"

const SESSION_STATUS_PATH = "/session/status"
const BUDDY_FEATURE_TOOL_IDS = [
  "goal_lint",
  "goal_commit",
  "prepare_resource",
  "ingest_full_text",
] as const

async function ensureBuddyPluginTools(directory: string) {
  await loadOpenCodeApp()
  await syncOpenCodeProjectConfig(directory)
}

async function listRegisteredToolIDs(directory: string): Promise<string[]> {
  return OpenCodeInstance.provide({
    directory,
    fn: () => ToolRegistry.ids(),
  })
}

afterEach(async () => {
  await OpenCodeInstance.disposeAll()
})

describe("proxy registration", () => {
  test("does not unregister Buddy feature tools when a proxied request omits registrations", async () => {
    await using project = await tmpdir({ git: true })

    await ensureBuddyPluginTools(project.path)

    const beforeToolIDs = await listRegisteredToolIDs(project.path)
    for (const toolID of BUDDY_FEATURE_TOOL_IDS) {
      expect(beforeToolIDs).toContain(toolID)
    }

    await fetchInProcessOpenCode({
      directory: project.path,
      method: "GET",
      path: SESSION_STATUS_PATH,
      headers: new Headers(),
    })

    await ensureBuddyPluginTools(project.path)

    const afterToolIDs = await listRegisteredToolIDs(project.path)
    for (const toolID of BUDDY_FEATURE_TOOL_IDS) {
      expect(afterToolIDs).toContain(toolID)
    }
  }, 30_000)

  test("project tool toggles deny tools via session permissions after plugin pre-registration", async () => {
    await using project = await tmpdir({ git: true })

    writeFileSync(
      path.join(project.path, "buddy.jsonc"),
      JSON.stringify(
        {
          tools: {
            ingest_full_text: false,
          },
        },
        null,
        2,
      ) + "\n",
    )

    await ensureBuddyPluginTools(project.path)

    expect(await listRegisteredToolIDs(project.path)).toContain("ingest_full_text")

    const buddyDefinition = REGISTERED_BUDDY_PERSONAS.find(
      (definition) => definition.id === "buddy",
    )
    if (!buddyDefinition) {
      throw new Error('Missing "buddy" persona definition')
    }

    const persona = getBuddyPersona("buddy")
    const sessionRuntime = resolveSessionRuntime({
      persona: {
        id: persona.id,
        features: buddyDefinition.features,
        defaultSurface: persona.defaultSurface,
      },
      teachingWorkspaceState: "inactive",
      configuredToolToggles: {
        ingest_full_text: false,
      },
    })
    const permission = buildBuddyRuntimeSessionPermissions({
      sessionRuntime,
    })

    expect(permission).toContainEqual({
      permission: "ingest_full_text",
      pattern: "*",
      action: "deny",
    })

    await fetchInProcessOpenCode({
      directory: project.path,
      method: "GET",
      path: SESSION_STATUS_PATH,
      headers: new Headers(),
    })

    expect(await listRegisteredToolIDs(project.path)).toContain("ingest_full_text")
  })
})
