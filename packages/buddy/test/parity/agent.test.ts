import { describe, expect, test } from "bun:test"
import path from "node:path"
import { writeFileSync } from "node:fs"
import { Agent as OpenCodeAgent } from "@buddy/opencode-adapter/agent"
import { PermissionNext } from "@buddy/opencode-adapter/permission"
import { withSyncedOpenCodeConfig } from "../helpers/opencode"
import { withRepo } from "./helpers"

function requireValue<T>(value: T | undefined, label: string): T {
  if (value !== undefined) {
    return value
  }

  throw new Error(`Missing ${label}`)
}

describe("parity.agent", () => {
  test("rejects non-persona values for default_persona", async () => {
    await withRepo(async (directory) => {
      writeFileSync(
        path.join(directory, "buddy.jsonc"),
        JSON.stringify({
          default_persona: "curriculum-orchestrator",
        }),
      )

      await expect(
        withSyncedOpenCodeConfig(directory, () => OpenCodeAgent.defaultAgent()),
      ).rejects.toThrow()
    })
  })

  test("orders configured default persona first in list", async () => {
    await withRepo(async (directory) => {
      writeFileSync(
        path.join(directory, "buddy.jsonc"),
        JSON.stringify({
          default_persona: "code-buddy",
        }),
      )

      const listed = await withSyncedOpenCodeConfig(directory, () => OpenCodeAgent.list())
      expect(listed[0]?.name).toBe("code-buddy")
      const names = listed.map((entry) => entry.name)
      expect(names).toContain("buddy")
      expect(names).toContain("build")
      expect(names).toContain("plan")
      expect(names).toContain("explore")
      expect(names).toContain("curriculum-orchestrator")
    })
  })

  test("preserves Buddy agent defaults when applying partial overrides", async () => {
    await withRepo(async (directory) => {
      writeFileSync(
        path.join(directory, "buddy.jsonc"),
        JSON.stringify({
          agent: {
            "code-buddy": {
              description: "patched only",
            },
          },
        }),
      )

      const codeBuddyAgent = requireValue(
        await withSyncedOpenCodeConfig(directory, () => OpenCodeAgent.get("code-buddy")),
        "code-buddy agent",
      )

      expect(codeBuddyAgent.description).toBe("patched only")
      expect(codeBuddyAgent.mode).toBe("primary")
      expect(codeBuddyAgent.steps).toBe(8)
      const codeBuddyPrompt = requireValue(codeBuddyAgent.prompt, "code-buddy prompt")
      expect(typeof codeBuddyPrompt).toBe("string")
      expect(codeBuddyPrompt.length).toBeGreaterThan(0)
    })
  })

  test("preserves curriculum-orchestrator defaults when applying partial overrides", async () => {
    await withRepo(async (directory) => {
      writeFileSync(
        path.join(directory, "buddy.jsonc"),
        JSON.stringify({
          agent: {
            "curriculum-orchestrator": {
              description: "patched curriculum only",
            },
          },
        }),
      )

      const curriculumAgent = requireValue(
        await withSyncedOpenCodeConfig(directory, () => OpenCodeAgent.get("curriculum-orchestrator")),
        "curriculum-orchestrator agent",
      )

      expect(curriculumAgent.description).toBe("patched curriculum only")
      expect(curriculumAgent.mode).toBe("subagent")
      expect(curriculumAgent.steps).toBe(8)
      const curriculumPrompt = requireValue(curriculumAgent.prompt, "curriculum-orchestrator prompt")
      expect(typeof curriculumPrompt).toBe("string")
      expect(curriculumPrompt.length).toBeGreaterThan(0)
    })
  })

  test("preserves wildcard permission rules when adding scoped overrides", async () => {
    await withRepo(async (directory) => {
      writeFileSync(
        path.join(directory, "buddy.jsonc"),
        JSON.stringify({
          agent: {
            "code-buddy": {
              permission: {
                task: {
                  "notes/*": "allow",
                },
              },
            },
          },
        }),
      )

      const codeBuddyAgent = requireValue(
        await withSyncedOpenCodeConfig(directory, () => OpenCodeAgent.get("code-buddy")),
        "code-buddy agent",
      )

      expect(PermissionNext.evaluate("task", "notes/lesson.md", codeBuddyAgent.permission).action).toBe("allow")
      expect(PermissionNext.evaluate("task", "tmp/scratch.md", codeBuddyAgent.permission).action).toBe("deny")
    })
  })

  test("registers math-buddy as a primary agent with inline figure permissions", async () => {
    await withRepo(async (directory) => {
      const result = await withSyncedOpenCodeConfig(directory, async () => ({
        agent: await OpenCodeAgent.get("math-buddy"),
        listed: await OpenCodeAgent.list(),
      }))

      const mathBuddyAgent = requireValue(result.agent, "math-buddy agent")
      expect(mathBuddyAgent.mode).toBe("primary")
      expect(result.listed.map((entry) => entry.name)).toContain("math-buddy")
      expect(PermissionNext.evaluate("render_figure", "figures/example.svg", mathBuddyAgent.permission).action).toBe(
        "allow",
      )
      expect(
        PermissionNext.evaluate("teaching_start_lesson", "teaching/lesson.ts", mathBuddyAgent.permission).action,
      ).toBe("deny")
    })
  })
})
