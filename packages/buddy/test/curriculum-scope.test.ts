import { describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
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

  test("prefers the on-disk curriculum after a direct file edit", async () => {
    const workspace = createWorkspace("buddy-curriculum-file")

    try {
      const savedMarkdown = "# Stored curriculum\n- [ ] stale task"
      const updatedMarkdown = "# Updated curriculum\n- [x] fresh task"

      const put = await app.request("/api/curriculum", {
        method: "PUT",
        headers: {
          "x-buddy-directory": workspace,
          "content-type": "application/json",
        },
        body: JSON.stringify({ markdown: savedMarkdown }),
      })
      expect(put.status).toBe(200)

      await fs.writeFile(path.join(workspace, ".buddy", "curriculum.md"), updatedMarkdown, "utf8")

      const get = await app.request("/api/curriculum", {
        headers: {
          "x-buddy-directory": workspace,
        },
      })
      expect(get.status).toBe(200)

      const body = (await get.json()) as { markdown: string }
      expect(body.markdown).toBe(updatedMarkdown)
    } finally {
      rmSync(workspace, { recursive: true, force: true })
    }
  })
})
