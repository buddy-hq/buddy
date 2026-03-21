import { beforeEach, describe, expect, test } from "bun:test"
import { mkdirSync, readFileSync, realpathSync, rmSync } from "node:fs"
import path from "node:path"
import { Project as OpenCodeProject } from "@buddy/opencode-adapter/project"
import { app } from "../src/index.ts"
import { Global } from "../src/storage/global"
import { createGitRepo } from "./helpers/repo"

const registryPath = path.join(Global.Path.state, "desktop-notebooks.json")

function readRegistryFile() {
  return JSON.parse(readFileSync(registryPath, "utf8")) as string[]
}

describe("open project routes", () => {
  beforeEach(() => {
    rmSync(registryPath, { force: true })
  })

  test("returns an empty list when desktop-notebooks.json is missing", async () => {
    const response = await app.request("/api/open-projects")

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ directories: [] })
  })

  test("resolves relative directories against BUDDY_DIRECTORY_BASE when configured", async () => {
    const repo = createGitRepo("buddy-route-open-project-base")
    const canonicalRepo = realpathSync(repo)
    const base = path.dirname(repo)
    const relativeDirectory = path.basename(repo)
    const originalDirectoryBase = process.env.BUDDY_DIRECTORY_BASE
    const originalAllowedRoots = process.env.BUDDY_ALLOWED_DIRECTORY_ROOTS

    process.env.BUDDY_DIRECTORY_BASE = base
    process.env.BUDDY_ALLOWED_DIRECTORY_ROOTS = base

    try {
      const response = await app.request("/api/open-projects", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          directory: relativeDirectory,
        }),
      })

      expect(response.status).toBe(200)
      await expect(response.json()).resolves.toEqual({
        directory: canonicalRepo,
      })
      expect(readRegistryFile()).toEqual([canonicalRepo])
    } finally {
      if (originalDirectoryBase === undefined) delete process.env.BUDDY_DIRECTORY_BASE
      else process.env.BUDDY_DIRECTORY_BASE = originalDirectoryBase

      if (originalAllowedRoots === undefined) delete process.env.BUDDY_ALLOWED_DIRECTORY_ROOTS
      else process.env.BUDDY_ALLOWED_DIRECTORY_ROOTS = originalAllowedRoots
    }
  })

  test("rejects directories outside allowed roots", async () => {
    const repo = createGitRepo("buddy-route-open-project-reject")
    const originalAllowedRoots = process.env.BUDDY_ALLOWED_DIRECTORY_ROOTS

    process.env.BUDDY_ALLOWED_DIRECTORY_ROOTS = path.join(repo, "different-root")

    try {
      const response = await app.request("/api/open-projects", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          directory: repo,
        }),
      })

      expect(response.status).toBe(403)
      await expect(response.json()).resolves.toEqual({
        error: "Directory is outside allowed roots",
      })
    } finally {
      if (originalAllowedRoots === undefined) delete process.env.BUDDY_ALLOWED_DIRECTORY_ROOTS
      else process.env.BUDDY_ALLOWED_DIRECTORY_ROOTS = originalAllowedRoots
    }
  })

  test("opening is idempotent and preserves existing order", async () => {
    const firstRepo = realpathSync(createGitRepo("buddy-route-open-project-first"))
    const secondRepo = realpathSync(createGitRepo("buddy-route-open-project-second"))
    const originalAllowedRoots = process.env.BUDDY_ALLOWED_DIRECTORY_ROOTS

    process.env.BUDDY_ALLOWED_DIRECTORY_ROOTS = [
      path.dirname(firstRepo),
      path.dirname(secondRepo),
    ].join(",")

    try {
      await app.request("/api/open-projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ directory: firstRepo }),
      })
      await app.request("/api/open-projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ directory: secondRepo }),
      })

      const repeatResponse = await app.request("/api/open-projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ directory: firstRepo }),
      })

      expect(repeatResponse.status).toBe(200)
      expect(readRegistryFile()).toEqual([secondRepo, firstRepo])
    } finally {
      if (originalAllowedRoots === undefined) delete process.env.BUDDY_ALLOWED_DIRECTORY_ROOTS
      else process.env.BUDDY_ALLOWED_DIRECTORY_ROOTS = originalAllowedRoots
    }
  })

  test("closing is idempotent", async () => {
    const firstRepo = realpathSync(createGitRepo("buddy-route-open-project-close-first"))
    const secondRepo = realpathSync(createGitRepo("buddy-route-open-project-close-second"))
    const originalAllowedRoots = process.env.BUDDY_ALLOWED_DIRECTORY_ROOTS

    process.env.BUDDY_ALLOWED_DIRECTORY_ROOTS = [
      path.dirname(firstRepo),
      path.dirname(secondRepo),
    ].join(",")

    try {
      await app.request("/api/open-projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ directory: firstRepo }),
      })
      await app.request("/api/open-projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ directory: secondRepo }),
      })

      const closeResponse = await app.request(
        `/api/open-projects?directory=${encodeURIComponent(firstRepo)}`,
        {
          method: "DELETE",
        },
      )
      expect(closeResponse.status).toBe(200)
      expect(readRegistryFile()).toEqual([secondRepo])

      const missingResponse = await app.request(
        `/api/open-projects?directory=${encodeURIComponent(firstRepo)}`,
        {
          method: "DELETE",
        },
      )
      expect(missingResponse.status).toBe(200)
      expect(readRegistryFile()).toEqual([secondRepo])
    } finally {
      if (originalAllowedRoots === undefined) delete process.env.BUDDY_ALLOWED_DIRECTORY_ROOTS
      else process.env.BUDDY_ALLOWED_DIRECTORY_ROOTS = originalAllowedRoots
    }
  })

  test("reorders the current registry and rejects set mismatches", async () => {
    const firstRepo = realpathSync(createGitRepo("buddy-route-open-project-order-first"))
    const secondRepo = realpathSync(createGitRepo("buddy-route-open-project-order-second"))
    const originalAllowedRoots = process.env.BUDDY_ALLOWED_DIRECTORY_ROOTS

    process.env.BUDDY_ALLOWED_DIRECTORY_ROOTS = [
      path.dirname(firstRepo),
      path.dirname(secondRepo),
    ].join(",")

    try {
      await app.request("/api/open-projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ directory: firstRepo }),
      })
      await app.request("/api/open-projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ directory: secondRepo }),
      })

      const reorderResponse = await app.request("/api/open-projects/order", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ directories: [firstRepo, secondRepo] }),
      })

      expect(reorderResponse.status).toBe(200)
      await expect(reorderResponse.json()).resolves.toEqual({
        directories: [firstRepo, secondRepo],
      })
      expect(readRegistryFile()).toEqual([firstRepo, secondRepo])

      const mismatchResponse = await app.request("/api/open-projects/order", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ directories: [firstRepo] }),
      })

      expect(mismatchResponse.status).toBe(400)
      await expect(mismatchResponse.json()).resolves.toEqual({
        error: "Directory order must match the current open-project set",
      })
    } finally {
      if (originalAllowedRoots === undefined) delete process.env.BUDDY_ALLOWED_DIRECTORY_ROOTS
      else process.env.BUDDY_ALLOWED_DIRECTORY_ROOTS = originalAllowedRoots
    }
  })

  test("listing open projects does not create a project for the backend cwd", async () => {
    const repo = createGitRepo("buddy-route-open-project-readonly")
    const canonicalRepo = realpathSync(repo)
    const originalCwd = process.cwd()
    const before = OpenCodeProject.list().map((project) => project.worktree)

    process.chdir(repo)

    try {
      const response = await app.request("/api/open-projects")

      expect(response.status).toBe(200)
      expect(OpenCodeProject.list().map((project) => project.worktree)).toEqual(before)

      const listed = (await response.json()) as { directories: string[] }
      expect(listed.directories.includes(canonicalRepo)).toBe(false)
    } finally {
      process.chdir(originalCwd)
    }
  })

  test("stores normalized directories from the live desktop-notebooks file format", async () => {
    const repo = createGitRepo("buddy-route-open-project-normalize")
    const nested = path.join(repo, "nested")
    mkdirSync(nested, { recursive: true })
    const canonicalRepo = realpathSync(repo)

    const originalAllowedRoots = process.env.BUDDY_ALLOWED_DIRECTORY_ROOTS
    process.env.BUDDY_ALLOWED_DIRECTORY_ROOTS = path.dirname(repo)

    try {
      await app.request("/api/open-projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ directory: `${nested}/../` }),
      })

      expect(readRegistryFile()).toEqual([canonicalRepo])
    } finally {
      if (originalAllowedRoots === undefined) delete process.env.BUDDY_ALLOWED_DIRECTORY_ROOTS
      else process.env.BUDDY_ALLOWED_DIRECTORY_ROOTS = originalAllowedRoots
    }
  })
})
