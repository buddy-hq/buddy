import { afterEach, describe, expect, test } from "bun:test"
import path from "node:path"
import { writeFileSync } from "node:fs"
import { Agent as OpenCodeAgent } from "@buddy/opencode-adapter/agent"
import { clearConfigOverlay, setConfigOverlay } from "@buddy/opencode-adapter/config"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { PermissionNext } from "@buddy/opencode-adapter/permission"
import { Config } from "@buddy/backend/config"
import { buildOpenCodeConfigOverlay } from "../../src/index"
import { tmpdir } from "../helpers/tmpdir"

const OVERLAY_PERMISSION = "buddy_overlay_test_permission"

async function disposeDirectory(directory: string): Promise<void> {
  await OpenCodeInstance.provide({
    directory,
    fn: () => OpenCodeInstance.dispose(),
  })
}

async function applyProjectOverlay(directory: string): Promise<void> {
  const config = await Config.getProject(directory)
  const overlay = await buildOpenCodeConfigOverlay({
    config,
    directory,
  })

  setConfigOverlay(directory, overlay)
  await disposeDirectory(directory)
}

async function readRuntimeAgentState(directory: string) {
  return OpenCodeInstance.provide({
    directory,
    async fn() {
      const buddyAgent = await OpenCodeAgent.get("buddy")
      return {
        defaultAgent: await OpenCodeAgent.defaultAgent(),
        buddyAgent,
        curriculumOrchestrator: await OpenCodeAgent.get("curriculum-orchestrator"),
        overlayPermissionAction: PermissionNext.evaluate(
          OVERLAY_PERMISSION,
          "*",
          buddyAgent.permission,
        ).action,
      }
    },
  })
}

afterEach(async () => {
  await OpenCodeInstance.disposeAll()
})

describe("opencode config overlay isolation", () => {
  test("keeps primary-agent and subagent overlays scoped to the active directory across resets", async () => {
    await using firstProject = await tmpdir({ git: true })
    await using secondProject = await tmpdir({ git: true })

    writeFileSync(
      path.join(firstProject.path, "buddy.jsonc"),
      JSON.stringify(
        {
          default_persona: "code-buddy",
          permission: {
            [OVERLAY_PERMISSION]: "allow",
          },
          agent: {
            "curriculum-orchestrator": {
              description: "first project curriculum",
            },
          },
        },
        null,
        2,
      ) + "\n",
    )
    writeFileSync(
      path.join(secondProject.path, "buddy.jsonc"),
      JSON.stringify(
        {
          default_persona: "math-buddy",
          permission: {
            [OVERLAY_PERMISSION]: "deny",
          },
          agent: {
            "curriculum-orchestrator": {
              description: "second project curriculum",
            },
          },
        },
        null,
        2,
      ) + "\n",
    )

    try {
      await applyProjectOverlay(firstProject.path)
      await applyProjectOverlay(secondProject.path)

      const firstInitial = await readRuntimeAgentState(firstProject.path)
      const secondInitial = await readRuntimeAgentState(secondProject.path)

      expect(firstInitial.defaultAgent).toBe("code-buddy")
      expect(firstInitial.curriculumOrchestrator?.description).toBe("first project curriculum")
      expect(firstInitial.overlayPermissionAction).toBe("allow")

      expect(secondInitial.defaultAgent).toBe("math-buddy")
      expect(secondInitial.curriculumOrchestrator?.description).toBe("second project curriculum")
      expect(secondInitial.overlayPermissionAction).toBe("deny")

      await disposeDirectory(firstProject.path)
      await disposeDirectory(secondProject.path)

      const firstAfterReset = await readRuntimeAgentState(firstProject.path)
      const secondAfterReset = await readRuntimeAgentState(secondProject.path)

      expect(firstAfterReset.defaultAgent).toBe("code-buddy")
      expect(firstAfterReset.curriculumOrchestrator?.description).toBe("first project curriculum")
      expect(firstAfterReset.overlayPermissionAction).toBe("allow")

      expect(secondAfterReset.defaultAgent).toBe("math-buddy")
      expect(secondAfterReset.curriculumOrchestrator?.description).toBe("second project curriculum")
      expect(secondAfterReset.overlayPermissionAction).toBe("deny")
    } finally {
      clearConfigOverlay(firstProject.path)
      clearConfigOverlay(secondProject.path)
    }
  })
})
