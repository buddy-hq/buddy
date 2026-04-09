import { describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { app } from "../src/index.ts"
import { createGitRepo } from "./helpers/repo"

describe("project file editor routes", () => {
  test("reads exact text content and saves with version updates", async () => {
    const repo = createGitRepo("buddy-project-file-editor")
    const targetPath = path.join(repo, "src", "app.ts")
    await fs.mkdir(path.dirname(targetPath), { recursive: true })
    await fs.writeFile(targetPath, "const answer = 42  \n\n", "utf8")

    const readResponse = await app.request("/api/file/edit?path=src/app.ts", {
      headers: {
        "x-buddy-directory": repo,
      },
    })

    expect(readResponse.status).toBe(200)
    const readBody = (await readResponse.json()) as {
      content: string
      version: string | null
    }
    expect(readBody.content).toBe("const answer = 42  \n\n")
    expect(typeof readBody.version).toBe("string")

    const saveResponse = await app.request("/api/file/edit?path=src/app.ts", {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        "x-buddy-directory": repo,
      },
      body: JSON.stringify({
        content: "const answer = 43\n",
        expectedVersion: readBody.version,
      }),
    })

    expect(saveResponse.status).toBe(200)
    const saveBody = (await saveResponse.json()) as {
      content: string
      version: string
    }
    expect(saveBody.content).toBe("const answer = 43\n")
    expect(saveBody.version).not.toBe(readBody.version)
    await expect(fs.readFile(targetPath, "utf8")).resolves.toBe("const answer = 43\n")
  })

  test("returns conflict when the on-disk version changed", async () => {
    const repo = createGitRepo("buddy-project-file-editor-conflict")
    const targetPath = path.join(repo, "src", "app.ts")
    await fs.mkdir(path.dirname(targetPath), { recursive: true })
    await fs.writeFile(targetPath, "export const value = 1\n", "utf8")

    const readResponse = await app.request("/api/file/edit?path=src/app.ts", {
      headers: {
        "x-buddy-directory": repo,
      },
    })
    const readBody = (await readResponse.json()) as {
      version: string | null
    }

    await fs.writeFile(targetPath, "export const value = 2\n", "utf8")

    const saveResponse = await app.request("/api/file/edit?path=src/app.ts", {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        "x-buddy-directory": repo,
      },
      body: JSON.stringify({
        content: "export const value = 3\n",
        expectedVersion: readBody.version,
      }),
    })

    expect(saveResponse.status).toBe(409)
  })

  test("rejects unsupported binary files", async () => {
    const repo = createGitRepo("buddy-project-file-editor-binary")
    const targetPath = path.join(repo, "report.pdf")
    await fs.writeFile(targetPath, Buffer.from("%PDF-1.4\n"))

    const readResponse = await app.request("/api/file/edit?path=report.pdf", {
      headers: {
        "x-buddy-directory": repo,
      },
    })

    expect(readResponse.status).toBe(415)
  })

  test("rejects paths that escape the project directory", async () => {
    const repo = createGitRepo("buddy-project-file-editor-escape")
    const outsidePath = path.join(path.dirname(repo), "outside.txt")
    await fs.writeFile(outsidePath, "outside\n", "utf8")

    const readResponse = await app.request("/api/file/edit?path=../outside.txt", {
      headers: {
        "x-buddy-directory": repo,
      },
    })

    expect(readResponse.status).toBe(403)
  })
})
