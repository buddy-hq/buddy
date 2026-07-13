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

    const statusResponse = await app.request("/api/file/edit/status?path=src/app.ts", {
      headers: {
        "x-buddy-directory": repo,
      },
    })

    expect(statusResponse.status).toBe(200)
    expect(await statusResponse.json()).toEqual({
      path: "src/app.ts",
      exists: true,
      version: readBody.version,
    })

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

  test("reads valid UTF-8 text containing form feed page separators", async () => {
    const repo = createGitRepo("buddy-project-file-editor-form-feed")
    const targetPath = path.join(repo, "notes", "pages.txt")
    const content = "Page 1\n\fPage 2\n"
    await fs.mkdir(path.dirname(targetPath), { recursive: true })
    await fs.writeFile(targetPath, content, "utf8")

    const readResponse = await app.request("/api/file/edit?path=notes/pages.txt", {
      headers: {
        "x-buddy-directory": repo,
      },
    })

    expect(readResponse.status).toBe(200)
    const readBody = (await readResponse.json()) as {
      content: string
      version: string | null
    }
    expect(readBody.content).toBe(content)
    expect(typeof readBody.version).toBe("string")
  })

  test("rejects invalid UTF-8 text files instead of replacement-decoding them", async () => {
    const repo = createGitRepo("buddy-project-file-editor-invalid-utf8")
    const targetPath = path.join(repo, "notes", "invalid.txt")
    const invalidContinuationByteWithoutLead = 0x80
    const invalidUtf8Content = Buffer.concat([
      Buffer.from("fo", "utf8"),
      Buffer.from([invalidContinuationByteWithoutLead]),
      Buffer.from("o", "utf8"),
    ])
    await fs.mkdir(path.dirname(targetPath), { recursive: true })
    await fs.writeFile(targetPath, invalidUtf8Content)

    const readResponse = await app.request("/api/file/edit?path=notes/invalid.txt", {
      headers: {
        "x-buddy-directory": repo,
      },
    })

    expect(readResponse.status).toBe(415)
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

  test("serializes concurrent saves that use the same expected version", async () => {
    const repo = createGitRepo("buddy-project-file-editor-concurrent")
    const targetPath = path.join(repo, "src", "app.ts")
    await fs.mkdir(path.dirname(targetPath), { recursive: true })
    await fs.writeFile(targetPath, "export const value = 1\n", "utf8")

    const readResponse = await app.request("/api/file/edit?path=src/app.ts", {
      headers: {
        "x-buddy-directory": repo,
      },
    })
    const readBody = (await readResponse.json()) as { version: string | null }

    const save = (content: string) =>
      app.request("/api/file/edit?path=src/app.ts", {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          "x-buddy-directory": repo,
        },
        body: JSON.stringify({ content, expectedVersion: readBody.version }),
      })
    const contents = ["export const value = 2\n", "export const value = 3\n"]
    const responses = await Promise.all(contents.map(save))

    expect(responses.map((response) => response.status).toSorted()).toEqual([200, 409])
    const winningIndex = responses.findIndex((response) => response.status === 200)
    await expect(fs.readFile(targetPath, "utf8")).resolves.toBe(contents[winningIndex])
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

    const statusResponse = await app.request("/api/file/edit/status?path=report.pdf", {
      headers: {
        "x-buddy-directory": repo,
      },
    })

    expect(statusResponse.status).toBe(415)
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

    const statusResponse = await app.request("/api/file/edit/status?path=../outside.txt", {
      headers: {
        "x-buddy-directory": repo,
      },
    })

    expect(statusResponse.status).toBe(403)
  })

  test("reports contained missing editable files without content", async () => {
    const repo = createGitRepo("buddy-project-file-editor-missing-status")
    await fs.mkdir(path.join(repo, "src"), { recursive: true })

    const statusResponse = await app.request("/api/file/edit/status?path=src/missing.md", {
      headers: {
        "x-buddy-directory": repo,
      },
    })

    expect(statusResponse.status).toBe(200)
    expect(await statusResponse.json()).toEqual({
      path: "src/missing.md",
      exists: false,
      version: null,
    })
  })
})
