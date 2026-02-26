import { describe, expect, test } from "bun:test"
import os from "node:os"
import path from "node:path"
import fs from "node:fs"
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { app } from "../src/index.ts"

async function json(response: Response) {
  return (await response.json()) as Record<string, unknown>
}

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
  const marker = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`
  runGit(root, ["init", "-q"])
  writeFileSync(path.join(root, "README.md"), `# ${marker}\n`)
  runGit(root, ["add", "README.md"])
  runGit(root, ["-c", "user.email=buddy@test.local", "-c", "user.name=Buddy Test", "commit", "-qm", "init"])
  return root
}

describe("multi-tenant session routes", () => {
  test("rejects directories outside allowed roots", async () => {
    const create = await app.request("/api/session", {
      method: "POST",
      headers: {
        "x-buddy-directory": "/",
      },
    })
    expect(create.status).toBe(403)
    const body = await json(create)
    expect(body.error).toBe("Directory is outside allowed roots")
  })

  test("scopes session access by project and allows same-project directories", async () => {
    const repoA = createGitRepo("buddy-route-project-a")
    const repoASubdir = path.join(repoA, "nested")
    mkdirSync(repoASubdir, { recursive: true })
    const repoB = createGitRepo("buddy-route-project-b")

    const createA = await app.request("/api/session", {
      method: "POST",
      headers: {
        "x-buddy-directory": repoA,
      },
    })
    expect(createA.status).toBe(200)
    const bodyA = await json(createA)
    const sessionID = String(bodyA.id)

    const getAFromSubdir = await app.request(`/api/session/${sessionID}`, {
      headers: {
        "x-buddy-directory": repoASubdir,
      },
    })
    expect(getAFromSubdir.status).toBe(200)

    const getB = await app.request(`/api/session/${sessionID}`, {
      headers: {
        "x-buddy-directory": repoB,
      },
    })
    expect(getB.status).toBe(404)
  })

  test("uses query directory before directory header", async () => {
    const queryDirectory = createGitRepo("buddy-route-query-priority")
    const headerDirectory = createGitRepo("buddy-route-header-priority")

    const create = await app.request(`/api/session?directory=${encodeURIComponent(queryDirectory)}`, {
      method: "POST",
      headers: {
        "x-buddy-directory": headerDirectory,
      },
    })
    expect(create.status).toBe(200)
    const body = await json(create)
    const sessionID = String(body.id)

    const fromQueryDirectory = await app.request(`/api/session/${sessionID}?directory=${encodeURIComponent(queryDirectory)}`)
    expect(fromQueryDirectory.status).toBe(200)

    const fromHeaderDirectory = await app.request(`/api/session/${sessionID}`, {
      headers: {
        "x-buddy-directory": headerDirectory,
      },
    })
    expect(fromHeaderDirectory.status).toBe(404)
  })

  test("lists sessions project-wide by default and supports directory filtering", async () => {
    const repo = createGitRepo("buddy-route-list-project-scope")
    const rootDirectory = repo
    const nestedDirectory = path.join(repo, "workspace")
    mkdirSync(nestedDirectory, { recursive: true })

    const repoB = createGitRepo("buddy-route-list-other-project")

    const createRoot = await app.request("/api/session", {
      method: "POST",
      headers: {
        "x-buddy-directory": rootDirectory,
      },
    })
    expect(createRoot.status).toBe(200)

    const createNested = await app.request("/api/session", {
      method: "POST",
      headers: {
        "x-buddy-directory": nestedDirectory,
      },
    })
    expect(createNested.status).toBe(200)

    const createOtherProject = await app.request("/api/session", {
      method: "POST",
      headers: {
        "x-buddy-directory": repoB,
      },
    })
    expect(createOtherProject.status).toBe(200)

    const projectWide = await app.request("/api/session", {
      headers: {
        "x-buddy-directory": nestedDirectory,
      },
    })
    expect(projectWide.status).toBe(200)
    const projectWideBody = (await projectWide.json()) as Array<{ id: string }>
    expect(projectWideBody).toHaveLength(2)

    const rootOnly = await app.request(`/api/session?directory=${encodeURIComponent(rootDirectory)}`, {
      headers: {
        "x-buddy-directory": nestedDirectory,
      },
    })
    expect(rootOnly.status).toBe(200)
    const rootOnlyBody = (await rootOnly.json()) as Array<{ id: string }>
    expect(rootOnlyBody).toHaveLength(1)

    const nestedOnly = await app.request(`/api/session?directory=${encodeURIComponent(nestedDirectory)}`, {
      headers: {
        "x-buddy-directory": rootDirectory,
      },
    })
    expect(nestedOnly.status).toBe(200)
    const nestedOnlyBody = (await nestedOnly.json()) as Array<{ id: string }>
    expect(nestedOnlyBody).toHaveLength(1)
  })

  test("allows sibling repository directories under monorepo parent", async () => {
    const siblingDirectory = path.resolve(process.cwd(), "..")
    expect(fs.existsSync(siblingDirectory)).toBe(true)

    const create = await app.request(`/api/session?directory=${encodeURIComponent(siblingDirectory)}`, {
      method: "POST",
    })
    expect(create.status).toBe(200)
  })
})
