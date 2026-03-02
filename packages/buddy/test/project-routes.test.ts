import { describe, expect, test } from "bun:test"
import os from "node:os"
import path from "node:path"
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { Project as OpenCodeProject } from "@buddy/opencode-adapter/project"
import { app } from "../src/index.ts"

function runGit(cwd: string, args: string[]) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
  })
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "git command failed")
  }
}

function createGitRepo(prefix: string) {
  const root = mkdtempSync(path.join(os.tmpdir(), `${prefix}-`))
  runGit(root, ["init", "-q"])
  writeFileSync(path.join(root, "README.md"), "# test\n")
  runGit(root, ["add", "README.md"])
  runGit(root, ["-c", "user.email=buddy@test.local", "-c", "user.name=Buddy Test", "commit", "-qm", "init"])
  return root
}

describe("project routes", () => {
  test("opens projects by resolving the requested directory on the backend", async () => {
    const repo = createGitRepo("buddy-route-project-open")
    const canonicalRepo = realpathSync(repo)
    const originalCwd = process.cwd()

    process.chdir(repo)

    try {
      const response = await app.request("/api/project", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          directory: ".",
        }),
      })

      expect(response.status).toBe(200)
      await expect(response.json()).resolves.toEqual({
        directory: canonicalRepo,
      })
    } finally {
      process.chdir(originalCwd)
    }
  })

  test("listing projects does not create a project for the backend cwd", async () => {
    const repo = createGitRepo("buddy-route-project-readonly")
    const canonicalRepo = realpathSync(repo)
    const originalCwd = process.cwd()
    const before = OpenCodeProject.list().map((project) => project.worktree)

    process.chdir(repo)

    try {
      const response = await app.request("/api/project")

      expect(response.status).toBe(200)
      expect(OpenCodeProject.list().map((project) => project.worktree)).toEqual(before)

      const listed = (await response.json()) as Array<{ worktree: string }>
      expect(listed.some((project) => project.worktree === canonicalRepo)).toBe(false)
    } finally {
      process.chdir(originalCwd)
    }
  })

  test("returns the canonical project for nested directories", async () => {
    const repo = createGitRepo("buddy-route-project-current")
    const canonicalRepo = realpathSync(repo)
    const nested = path.join(repo, "nested")
    mkdirSync(nested, { recursive: true })

    const response = await app.request("/api/project/current", {
      headers: {
        "x-buddy-directory": nested,
      },
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      id: expect.any(String),
      worktree: canonicalRepo,
    })
  })

  test("lists and updates projects with the vendored project payload", async () => {
    const repo = createGitRepo("buddy-route-project-list")
    const canonicalRepo = realpathSync(repo)

    const currentResponse = await app.request("/api/project/current", {
      headers: {
        "x-buddy-directory": repo,
      },
    })

    expect(currentResponse.status).toBe(200)
    const current = (await currentResponse.json()) as {
      id: string
      worktree: string
      name?: string
    }

    const listResponse = await app.request("/api/project")
    expect(listResponse.status).toBe(200)
    const list = (await listResponse.json()) as Array<{
      id: string
      worktree: string
      name?: string
    }>

    expect(Array.isArray(list)).toBe(true)
    expect(list.some((project) => project.id === current.id && project.worktree === canonicalRepo)).toBe(true)

    const updateResponse = await app.request(`/api/project/${encodeURIComponent(current.id)}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        name: "Renamed project",
      }),
    })

    expect(updateResponse.status).toBe(200)
    await expect(updateResponse.json()).resolves.toMatchObject({
      id: current.id,
      worktree: canonicalRepo,
      name: "Renamed project",
    })
  })
})
