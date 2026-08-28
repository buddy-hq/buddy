import { spawnSync } from "node:child_process"
import { mkdirSync, realpathSync, writeFileSync } from "node:fs"
import { describe, expect, test } from "bun:test"
import path from "node:path"
import { app } from "../src/index.ts"
import { createGitRepo } from "./helpers/repo"
import {
  requireJsonObject,
  requireJsonArray,
  requireString,
  parseJsonObject,
} from "./helpers/parse"
import { temporaryDirectory } from "./helpers/temporary-directory"

async function createFixedDateGitRepo(prefix: string) {
  const directory = await temporaryDirectory({ prefix: `${prefix}-` })
  const runGit = (args: string[]) => {
    const result = spawnSync("git", args, {
      cwd: directory.path,
      encoding: "utf8",
      env: {
        ...process.env,
        GIT_AUTHOR_DATE: "2026-01-01T00:00:00Z",
        GIT_COMMITTER_DATE: "2026-01-01T00:00:00Z",
      },
    })
    if (result.status !== 0) {
      throw new Error(result.stderr || result.stdout || "git command failed")
    }
  }

  try {
    runGit(["init", "-q"])
    writeFileSync(path.join(directory.path, "README.md"), "# test\n")
    runGit(["add", "README.md"])
    runGit([
      "-c",
      "user.email=buddy@test.local",
      "-c",
      "user.name=Buddy Test",
      "commit",
      "-qm",
      "init",
    ])
    return directory
  } catch (error) {
    await directory[Symbol.asyncDispose]()
    throw error
  }
}

async function openProject(directory: string) {
  const response = await app.request("/api/open-projects", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ directory }),
  })

  expect(response.status).toBe(200)
}

describe("project routes", () => {
  test("returns the canonical project for nested directories", async () => {
    await using repo = await createGitRepo("buddy-route-project-current")
    const canonicalRepo = realpathSync(repo.path)
    const nested = path.join(repo.path, "nested")
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
    await using repo = await createGitRepo("buddy-route-project-list")
    const canonicalRepo = realpathSync(repo.path)

    const currentResponse = await app.request("/api/project/current", {
      headers: {
        "x-buddy-directory": repo.path,
      },
    })

    expect(currentResponse.status).toBe(200)
    const current = requireJsonObject(await currentResponse.json())

    const listResponse = await app.request("/api/project")
    expect(listResponse.status).toBe(200)
    const list = requireJsonArray(await listResponse.json())

    expect(Array.isArray(list)).toBe(true)
    expect(
      list.some((project) => {
        const record = parseJsonObject(project)
        return record?.id === current.id && record.worktree === canonicalRepo
      }),
    ).toBe(true)

    const updateResponse = await app.request(
      `/api/project/${encodeURIComponent(requireString(current.id, "project id"))}`,
      {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          name: "Renamed project",
        }),
      },
    )

    expect(updateResponse.status).toBe(200)
    await expect(updateResponse.json()).resolves.toMatchObject({
      id: current.id,
      worktree: canonicalRepo,
      name: "Renamed project",
    })
  })

  test("keeps unrelated local repos distinct when git root commits collide", async () => {
    await using firstRepo = await createFixedDateGitRepo("buddy-route-project-collision-first")
    await using secondRepo = await createFixedDateGitRepo("buddy-route-project-collision-second")
    await using targetRepo = await createFixedDateGitRepo("buddy-route-project-collision-target")
    const firstRepoPath = realpathSync(firstRepo.path)
    const secondRepoPath = realpathSync(secondRepo.path)
    const targetRepoPath = realpathSync(targetRepo.path)
    const nested = path.join(targetRepoPath, "nested")
    mkdirSync(nested, { recursive: true })

    await openProject(firstRepoPath)
    await openProject(secondRepoPath)

    const currentResponse = await app.request("/api/project/current", {
      headers: {
        "x-buddy-directory": nested,
      },
    })

    expect(currentResponse.status).toBe(200)
    const current = requireJsonObject(await currentResponse.json())

    expect(current.worktree).toBe(targetRepoPath)

    const listResponse = await app.request("/api/project")
    expect(listResponse.status).toBe(200)
    const list = requireJsonArray(await listResponse.json())

    expect(
      list.some((project) => {
        const record = parseJsonObject(project)
        return record?.id === current.id && record.worktree === targetRepoPath
      }),
    ).toBe(true)
  })
})
