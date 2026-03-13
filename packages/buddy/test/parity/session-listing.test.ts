import { describe, expect, test } from "bun:test"
import path from "node:path"
import { mkdirSync } from "node:fs"
import { app } from "../../src/index.ts"
import { withRepo } from "./helpers"

describe("parity.routes.session-listing", () => {
  test("lists sessions across project directories and filters by directory", async () => {
    await withRepo(async (directory) => {
      const nested = path.join(directory, "nested")
      mkdirSync(nested, { recursive: true })

      const createRoot = await app.request("/api/session", {
        method: "POST",
        headers: { "x-buddy-directory": directory },
      })
      expect(createRoot.status).toBe(200)

      const createNested = await app.request("/api/session", {
        method: "POST",
        headers: { "x-buddy-directory": nested },
      })
      expect(createNested.status).toBe(200)

      const projectWide = await app.request("/api/session", {
        headers: { "x-buddy-directory": nested },
      })
      const projectSessions = (await projectWide.json()) as Array<{ id: string }>
      expect(projectSessions).toHaveLength(2)

      const rootOnly = await app.request(`/api/session?directory=${encodeURIComponent(directory)}`, {
        headers: { "x-buddy-directory": nested },
      })
      const rootSessions = (await rootOnly.json()) as Array<{ id: string }>
      expect(rootSessions).toHaveLength(1)
    })
  })

  test("session selection is scoped to project", async () => {
    await withRepo(async (repoA) => {
      await withRepo(async (repoB) => {
        const created = await app.request("/api/session", {
          method: "POST",
          headers: { "x-buddy-directory": repoA },
        })
        const session = (await created.json()) as { id: string }

        const sameProject = await app.request(`/api/session/${session.id}`, {
          headers: { "x-buddy-directory": repoA },
        })
        expect(sameProject.status).toBe(200)

        const otherProject = await app.request(`/api/session/${session.id}`, {
          headers: { "x-buddy-directory": repoB },
        })
        expect(otherProject.status).toBe(404)
      })
    })
  })
})
