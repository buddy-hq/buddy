import { describe, expect, test } from "bun:test"
import path from "node:path"
import { mkdirSync } from "node:fs"
import { app } from "../../src/index.ts"
import { createGitRepo } from "../helpers/repo"
import { requireJsonArray, requireJsonObject } from "../helpers/parse"

async function json(response: Response) {
  return requireJsonObject(await response.json())
}

function createMarkedGitRepo(prefix: string) {
  return createGitRepo(prefix, { readme: `# ${prefix}-marker\n` })
}

describe("project-scoped session routes", () => {
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
    const repoA = createMarkedGitRepo("buddy-route-project-a")
    const repoASubdir = path.join(repoA, "nested")
    mkdirSync(repoASubdir, { recursive: true })
    const repoB = createMarkedGitRepo("buddy-route-project-b")

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

    const getMessagesFromSubdir = await app.request(`/api/session/${sessionID}/message`, {
      headers: {
        "x-buddy-directory": repoASubdir,
      },
    })
    expect(getMessagesFromSubdir.status).toBe(200)

    const getB = await app.request(`/api/session/${sessionID}`, {
      headers: {
        "x-buddy-directory": repoB,
      },
    })
    expect(getB.status).toBe(404)

    const deleteB = await app.request(`/api/session/${sessionID}`, {
      method: "DELETE",
      headers: {
        "x-buddy-directory": repoB,
      },
    })
    expect(deleteB.status).toBe(404)

    const getAAfterRejectedDelete = await app.request(`/api/session/${sessionID}`, {
      headers: {
        "x-buddy-directory": repoA,
      },
    })
    expect(getAAfterRejectedDelete.status).toBe(200)
  })

  test("rejects conflicting query and header directory scopes", async () => {
    const queryDirectory = createMarkedGitRepo("buddy-route-query-priority")
    const headerDirectory = createMarkedGitRepo("buddy-route-header-priority")

    const create = await app.request(
      `/api/session?directory=${encodeURIComponent(queryDirectory)}`,
      {
        method: "POST",
        headers: {
          "x-buddy-directory": headerDirectory,
        },
      },
    )
    expect(create.status).toBe(400)
    expect(await json(create)).toEqual({
      error:
        "Conflicting directory scopes were provided. Use one directory or make every scope identical.",
    })

    const matchingScopes = await app.request(
      `/api/session?directory=${encodeURIComponent(queryDirectory)}`,
      {
        method: "POST",
        headers: {
          "x-buddy-directory": queryDirectory,
        },
      },
    )
    expect(matchingScopes.status).toBe(200)
  })

  test("lists sessions project-wide by default and supports directory filtering", async () => {
    const repo = createMarkedGitRepo("buddy-route-list-project-scope")
    const rootDirectory = repo
    const nestedDirectory = path.join(repo, "workspace")
    mkdirSync(nestedDirectory, { recursive: true })

    const repoB = createMarkedGitRepo("buddy-route-list-other-project")

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
    const projectWideBody = requireJsonArray(await projectWide.json())
    expect(projectWideBody).toHaveLength(2)

    const rootOnly = await app.request(
      `/api/session?directory=${encodeURIComponent(rootDirectory)}`,
    )
    expect(rootOnly.status).toBe(200)
    const rootOnlyBody = requireJsonArray(await rootOnly.json())
    expect(rootOnlyBody).toHaveLength(1)

    const nestedOnly = await app.request(
      `/api/session?directory=${encodeURIComponent(nestedDirectory)}`,
    )
    expect(nestedOnly.status).toBe(200)
    const nestedOnlyBody = requireJsonArray(await nestedOnly.json())
    expect(nestedOnlyBody).toHaveLength(1)
  })
})
