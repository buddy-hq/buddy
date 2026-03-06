import { describe, expect, test } from "bun:test"
import os from "node:os"
import path from "node:path"
import { mkdtempSync, rmSync } from "node:fs"
import { app } from "../src/index.ts"

function createWorkspace(prefix: string) {
  return mkdtempSync(path.join(os.tmpdir(), `${prefix}-`))
}

describe("curriculum scope", () => {
  test("isolates workspace context for non-git directories", async () => {
    const workspaceA = createWorkspace("buddy-curriculum-a")
    const workspaceB = createWorkspace("buddy-curriculum-b")

    try {
      const patchA = await app.request("/api/learner/context", {
        method: "POST",
        headers: {
          "x-buddy-directory": workspaceA,
          "content-type": "application/json",
        },
        body: JSON.stringify({ label: "Workspace A", tags: ["tauri"] }),
      })
      expect(patchA.status).toBe(200)

      const patchB = await app.request("/api/learner/context", {
        method: "POST",
        headers: {
          "x-buddy-directory": workspaceB,
          "content-type": "application/json",
        },
        body: JSON.stringify({ label: "Workspace B", tags: ["rust"] }),
      })
      expect(patchB.status).toBe(200)

      const getA = await app.request("/api/learner/curriculum-view", {
        headers: {
          "x-buddy-directory": workspaceA,
        },
      })
      expect(getA.status).toBe(200)
      const getABody = (await getA.json()) as { workspace: { label: string; tags: string[] }; markdown: string }
      expect(getABody.workspace.label).toBe("Workspace A")
      expect(getABody.workspace.tags).toContain("tauri")
      expect(getABody.markdown).toContain("Workspace A")

      const getB = await app.request("/api/learner/curriculum-view", {
        headers: {
          "x-buddy-directory": workspaceB,
        },
      })
      expect(getB.status).toBe(200)
      const getBBody = (await getB.json()) as { workspace: { label: string; tags: string[] }; markdown: string }
      expect(getBBody.workspace.label).toBe("Workspace B")
      expect(getBBody.workspace.tags).toContain("rust")
      expect(getBBody.markdown).toContain("Workspace B")
    } finally {
      rmSync(workspaceA, { recursive: true, force: true })
      rmSync(workspaceB, { recursive: true, force: true })
    }
  })

  test("returns the latest workspace context after an explicit update", async () => {
    const workspace = createWorkspace("buddy-curriculum-file")

    try {
      const initial = await app.request("/api/learner/context", {
        method: "POST",
        headers: {
          "x-buddy-directory": workspace,
          "content-type": "application/json",
        },
        body: JSON.stringify({ label: "Stored curriculum", tags: ["stale"] }),
      })
      expect(initial.status).toBe(200)

      const updated = await app.request("/api/learner/context", {
        method: "POST",
        headers: {
          "x-buddy-directory": workspace,
          "content-type": "application/json",
        },
        body: JSON.stringify({ label: "Updated curriculum", tags: ["fresh"] }),
      })
      expect(updated.status).toBe(200)

      const get = await app.request("/api/learner/curriculum-view", {
        headers: {
          "x-buddy-directory": workspace,
        },
      })
      expect(get.status).toBe(200)

      const body = (await get.json()) as { workspace: { label: string; tags: string[] }; markdown: string }
      expect(body.workspace.label).toBe("Updated curriculum")
      expect(body.workspace.tags).toContain("fresh")
      expect(body.markdown).toContain("Updated curriculum")
    } finally {
      rmSync(workspace, { recursive: true, force: true })
    }
  })
})
