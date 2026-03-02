import { describe, expect, test } from "bun:test"
import path from "node:path"
import { mkdirSync } from "node:fs"
import { Project as OpenCodeProject } from "@buddy/opencode-adapter/project"
import { withRepo } from "../helpers"

describe("parity.project.project", () => {
  test("uses same project identity across nested directories", async () => {
    await withRepo(async (directory) => {
      const nested = path.join(directory, "packages", "feature")
      mkdirSync(nested, { recursive: true })

      const rootProject = await OpenCodeProject.fromDirectory(directory)
      const nestedProject = await OpenCodeProject.fromDirectory(nested)

      expect(rootProject.project.id).toBe(nestedProject.project.id)
      expect(rootProject.project.worktree).toBe(nestedProject.project.worktree)
    })
  })

  test("returns different ids for unrelated repositories", async () => {
    await withRepo(async (repoA) => {
      await withRepo(async (repoB) => {
        const a = await OpenCodeProject.fromDirectory(repoA)
        const b = await OpenCodeProject.fromDirectory(repoB)
        expect(a.project.id).not.toBe(b.project.id)
      })
    })
  })
})
