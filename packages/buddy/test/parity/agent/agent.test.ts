import { describe, expect, test } from "bun:test"
import path from "node:path"
import { writeFileSync } from "node:fs"
import { Agent } from "../../../src/agent/agent.js"
import { inDirectory, withRepo } from "../helpers"

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
        inDirectory(directory, () => Agent.defaultAgent()),
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

      const listed = await inDirectory(directory, () => Agent.list())
      expect(listed[0]?.name).toBe("build")
      expect(listed.some((entry) => entry.name === "plan")).toBe(true)
      expect(listed.some((entry) => entry.name === "explore")).toBe(true)
      expect(listed.some((entry) => entry.name === "curriculum-builder")).toBe(true)
    })
  })
})
