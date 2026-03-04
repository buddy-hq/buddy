import { describe, expect, test } from "bun:test"
import path from "node:path"
import { writeFileSync } from "node:fs"
import { Agent as OpenCodeAgent } from "@buddy/opencode-adapter/agent"
import { PermissionNext } from "@buddy/opencode-adapter/permission"
import { withSyncedOpenCodeConfig } from "../../helpers/opencode.js"
import { withRepo } from "../helpers"

describe("parity.agent", () => {
  test("rejects subagent as default agent", async () => {
    await withRepo(async (directory) => {
      writeFileSync(
        path.join(directory, "buddy.jsonc"),
        JSON.stringify({
          default_agent: "curriculum-builder",
        }),
      )

      await expect(
        withSyncedOpenCodeConfig(directory, () => OpenCodeAgent.defaultAgent()),
      ).rejects.toThrow("subagent")
    })
  })

  test("orders configured default agent first in list", async () => {
    await withRepo(async (directory) => {
      writeFileSync(
        path.join(directory, "buddy.jsonc"),
        JSON.stringify({
          default_agent: "build",
        }),
      )

      const listed = await withSyncedOpenCodeConfig(directory, () => OpenCodeAgent.list())
      expect(listed[0]?.name).toBe("build")
      expect(listed.some((entry) => entry.name === "plan")).toBe(true)
      expect(listed.some((entry) => entry.name === "explore")).toBe(true)
      expect(listed.some((entry) => entry.name === "curriculum-builder")).toBe(true)
    })
  })

  test("preserves Buddy agent defaults when applying partial overrides", async () => {
    await withRepo(async (directory) => {
      writeFileSync(
        path.join(directory, "buddy.jsonc"),
        JSON.stringify({
          agent: {
            "code-teacher": {
              description: "patched only",
            },
          },
        }),
      )

      const agent = await withSyncedOpenCodeConfig(directory, () => OpenCodeAgent.get("code-teacher"))

      expect(agent).toBeDefined()
      expect(agent?.description).toBe("patched only")
      expect(agent?.mode).toBe("primary")
      expect(agent?.steps).toBe(8)
      expect(typeof agent?.prompt).toBe("string")
      expect(agent?.prompt?.length).toBeGreaterThan(0)
    })
  })

  test("preserves curriculum-builder defaults when applying partial overrides", async () => {
    await withRepo(async (directory) => {
      writeFileSync(
        path.join(directory, "buddy.jsonc"),
        JSON.stringify({
          agent: {
            "curriculum-builder": {
              description: "patched curriculum only",
            },
          },
        }),
      )

      const agent = await withSyncedOpenCodeConfig(directory, () => OpenCodeAgent.get("curriculum-builder"))

      expect(agent).toBeDefined()
      expect(agent?.description).toBe("patched curriculum only")
      expect(agent?.mode).toBe("subagent")
      expect(agent?.steps).toBe(8)
      expect(typeof agent?.prompt).toBe("string")
      expect(agent?.prompt?.length).toBeGreaterThan(0)
    })
  })

  test("preserves wildcard permission rules when adding scoped overrides", async () => {
    await withRepo(async (directory) => {
      writeFileSync(
        path.join(directory, "buddy.jsonc"),
        JSON.stringify({
          agent: {
            "code-teacher": {
              permission: {
                task: {
                  "notes/*": "allow",
                },
              },
            },
          },
        }),
      )

      const agent = await withSyncedOpenCodeConfig(directory, () => OpenCodeAgent.get("code-teacher"))

      expect(agent).toBeDefined()
      expect(PermissionNext.evaluate("task", "notes/lesson.md", agent!.permission).action).toBe("allow")
      expect(PermissionNext.evaluate("task", "tmp/scratch.md", agent!.permission).action).toBe("deny")
    })
  })

  test("registers math-teacher as a primary agent with inline figure permissions", async () => {
    await withRepo(async (directory) => {
      const result = await withSyncedOpenCodeConfig(directory, async () => ({
        agent: await OpenCodeAgent.get("math-teacher"),
        listed: await OpenCodeAgent.list(),
      }))

      expect(result.agent).toBeDefined()
      expect(result.agent?.mode).toBe("primary")
      expect(result.listed.some((entry) => entry.name === "math-teacher")).toBe(true)
      expect(PermissionNext.evaluate("render_figure", "figures/example.svg", result.agent!.permission).action).toBe(
        "allow",
      )
      expect(
        PermissionNext.evaluate("teaching_start_lesson", "teaching/lesson.ts", result.agent!.permission).action,
      ).toBe("deny")
    })
  })
})
