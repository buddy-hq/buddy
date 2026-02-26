import { describe, expect, test } from "bun:test"
import os from "node:os"
import path from "node:path"
import { mkdtempSync, rmSync } from "node:fs"
import { app } from "../src/index.ts"

function createWorkspace(prefix: string) {
  return mkdtempSync(path.join(os.tmpdir(), `${prefix}-`))
}

describe("curriculum scope", () => {
  test("isolates curriculum for non-git directories", async () => {
    const workspaceA = createWorkspace("buddy-curriculum-a")
    const workspaceB = createWorkspace("buddy-curriculum-b")

    try {
      const markdownA = "# Workspace A\n- [ ] task a"
      const markdownB = "# Workspace B\n- [ ] task b"

      const putA = await app.request("/api/curriculum", {
        method: "PUT",
        headers: {
          "x-buddy-directory": workspaceA,
          "content-type": "application/json",
        },
        body: JSON.stringify({ markdown: markdownA }),
      })
      expect(putA.status).toBe(200)

      const putB = await app.request("/api/curriculum", {
        method: "PUT",
        headers: {
          "x-buddy-directory": workspaceB,
          "content-type": "application/json",
        },
        body: JSON.stringify({ markdown: markdownB }),
      })
      expect(putB.status).toBe(200)

      const getA = await app.request("/api/curriculum", {
        headers: {
          "x-buddy-directory": workspaceA,
        },
      })
      expect(getA.status).toBe(200)
      const getABody = (await getA.json()) as { markdown: string }
      expect(getABody.markdown).toBe(markdownA)

      const getB = await app.request("/api/curriculum", {
        headers: {
          "x-buddy-directory": workspaceB,
        },
      })
      expect(getB.status).toBe(200)
      const getBBody = (await getB.json()) as { markdown: string }
      expect(getBBody.markdown).toBe(markdownB)
    } finally {
      rmSync(workspaceA, { recursive: true, force: true })
      rmSync(workspaceB, { recursive: true, force: true })
    }
  })
})
