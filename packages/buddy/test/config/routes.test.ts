import { describe, expect, test } from "bun:test"
import path from "node:path"
import fs from "node:fs"
import { writeFileSync } from "node:fs"
import { app } from "../../src/index.ts"
import { Global } from "../../src/storage"
import { createGitRepo } from "../helpers/repo"

describe("config routes", () => {
  test("patches and returns project config", async () => {
    const repo = createGitRepo("buddy-route-config-project")

    const patchResponse = await app.request("/api/config", {
      method: "PATCH",
      headers: {
        "x-buddy-directory": repo,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        default_persona: "code-buddy",
        model: "anthropic/route-project",
      }),
    })

    expect(patchResponse.status).toBe(200)

    const getResponse = await app.request("/api/config", {
      headers: {
        "x-buddy-directory": repo,
      },
    })

    expect(getResponse.status).toBe(200)
    const body = (await getResponse.json()) as {
      default_persona?: string
      model?: string
    }

    expect(body.default_persona).toBe("code-buddy")
    expect(body.model).toBe("anthropic/route-project")
    expect(
      fs.existsSync(path.join(repo, "buddy.jsonc")) || fs.existsSync(path.join(repo, "buddy.json")),
    ).toBe(true)
  })

  test("uses only the project root config when nested folders are opened", async () => {
    const repo = createGitRepo("buddy-route-config-root-only")
    const nested = path.join(repo, "nested")
    fs.mkdirSync(nested, { recursive: true })
    writeFileSync(path.join(nested, "buddy.jsonc"), '{"default_persona":"math-buddy"}\n')

    const patchResponse = await app.request("/api/config", {
      method: "PATCH",
      headers: {
        "x-buddy-directory": nested,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        default_persona: "code-buddy",
      }),
    })

    expect(patchResponse.status).toBe(200)

    const getResponse = await app.request("/api/config", {
      headers: {
        "x-buddy-directory": nested,
      },
    })

    expect(getResponse.status).toBe(200)
    const body = (await getResponse.json()) as {
      default_persona?: string
    }

    expect(body.default_persona).toBe("code-buddy")
    expect(fs.readFileSync(path.join(nested, "buddy.jsonc"), "utf8")).toContain(
      '"default_persona":"math-buddy"',
    )
    expect(
      fs.existsSync(path.join(repo, "buddy.jsonc")) || fs.existsSync(path.join(repo, "buddy.json")),
    ).toBe(true)
  })

  test("returns and patches global config", async () => {
    const globalFile = path.join(Global.Path.config, "buddy.jsonc")
    fs.mkdirSync(path.dirname(globalFile), { recursive: true })
    const previousGlobal = fs.existsSync(globalFile)
      ? fs.readFileSync(globalFile, "utf8")
      : undefined

    try {
      const getBefore = await app.request("/api/config", {
        headers: {
          "x-buddy-directory": process.cwd(),
        },
      })
      expect(getBefore.status).toBe(200)

      const patch = await app.request("/api/global/config", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "anthropic/route-global",
        }),
      })
      expect(patch.status).toBe(200)

      const getAfter = await app.request("/api/global/config")
      expect(getAfter.status).toBe(200)
      const afterBody = (await getAfter.json()) as { model?: string }
      expect(afterBody.model).toBe("anthropic/route-global")
    } finally {
      if (previousGlobal === undefined) {
        fs.rmSync(globalFile, { force: true })
      } else {
        writeFileSync(globalFile, previousGlobal)
      }

      await app.request("/api/global/config", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({}),
      })
    }
  })

  test("returns raw notebook config without merged global defaults", async () => {
    const repo = createGitRepo("buddy-route-config-raw")
    const globalFile = path.join(Global.Path.config, "buddy.jsonc")
    fs.mkdirSync(path.dirname(globalFile), { recursive: true })
    const previousGlobal = fs.existsSync(globalFile)
      ? fs.readFileSync(globalFile, "utf8")
      : undefined

    writeFileSync(
      path.join(repo, "buddy.jsonc"),
      JSON.stringify(
        {
          default_persona: "code-buddy",
          tools: {
            get_next_standards: true,
          },
        },
        null,
        2,
      ) + "\n",
    )

    try {
      writeFileSync(
        globalFile,
        JSON.stringify(
          {
            model: "anthropic/route-global-default",
            tools: {
              search_standards: false,
            },
          },
          null,
          2,
        ) + "\n",
      )

      const rawResponse = await app.request("/api/config/raw", {
        headers: {
          "x-buddy-directory": repo,
        },
      })

      expect(rawResponse.status).toBe(200)
      const rawBody = (await rawResponse.json()) as {
        default_persona?: string
        model?: string
        tools?: Record<string, boolean>
      }
      expect(rawBody.default_persona).toBe("code-buddy")
      expect(rawBody.model).toBeUndefined()
      expect(rawBody.tools?.get_next_standards).toBe(true)
      expect(rawBody.tools?.search_standards).toBeUndefined()

      const mergedResponse = await app.request("/api/config", {
        headers: {
          "x-buddy-directory": repo,
        },
      })
      expect(mergedResponse.status).toBe(200)
      await expect(mergedResponse.json()).resolves.toMatchObject({
        default_persona: "code-buddy",
        model: "anthropic/route-global-default",
        tools: {
          search_standards: false,
          get_next_standards: true,
        },
      })
    } finally {
      if (previousGlobal === undefined) {
        fs.rmSync(globalFile, { force: true })
      } else {
        writeFileSync(globalFile, previousGlobal)
      }

      await app.request("/api/global/config", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({}),
      })
    }
  })

  test("patching notebook config keeps inherited global defaults out of the notebook file", async () => {
    const repo = createGitRepo("buddy-route-config-no-global-copy")
    const globalFile = path.join(Global.Path.config, "buddy.jsonc")
    fs.mkdirSync(path.dirname(globalFile), { recursive: true })
    const previousGlobal = fs.existsSync(globalFile)
      ? fs.readFileSync(globalFile, "utf8")
      : undefined

    try {
      writeFileSync(
        globalFile,
        JSON.stringify(
          {
            model: "anthropic/route-global-only",
          },
          null,
          2,
        ) + "\n",
      )

      const patchResponse = await app.request("/api/config", {
        method: "PATCH",
        headers: {
          "x-buddy-directory": repo,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          default_persona: "code-buddy",
        }),
      })

      expect(patchResponse.status).toBe(200)
      await expect(patchResponse.json()).resolves.toMatchObject({
        default_persona: "code-buddy",
        model: "anthropic/route-global-only",
      })

      const configFile = path.join(repo, "buddy.jsonc")
      expect(fs.readFileSync(configFile, "utf8")).toContain('"default_persona": "code-buddy"')
      expect(fs.readFileSync(configFile, "utf8")).not.toContain("anthropic/route-global-only")
    } finally {
      if (previousGlobal === undefined) {
        fs.rmSync(globalFile, { force: true })
      } else {
        writeFileSync(globalFile, previousGlobal)
      }

      await app.request("/api/global/config", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({}),
      })
    }
  })

  test("removing a notebook override falls back to the global default", async () => {
    const repo = createGitRepo("buddy-route-config-remove-override")
    const globalFile = path.join(Global.Path.config, "buddy.jsonc")
    fs.mkdirSync(path.dirname(globalFile), { recursive: true })
    const previousGlobal = fs.existsSync(globalFile)
      ? fs.readFileSync(globalFile, "utf8")
      : undefined

    writeFileSync(
      path.join(repo, "buddy.jsonc"),
      JSON.stringify(
        {
          tools: {
            search_standards: true,
          },
        },
        null,
        2,
      ) + "\n",
    )

    try {
      writeFileSync(
        globalFile,
        JSON.stringify(
          {
            tools: {
              search_standards: false,
            },
          },
          null,
          2,
        ) + "\n",
      )

      const patchResponse = await app.request("/api/config", {
        method: "PATCH",
        headers: {
          "x-buddy-directory": repo,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          tools: {
            search_standards: null,
          },
        }),
      })

      expect(patchResponse.status).toBe(200)
      await expect(patchResponse.json()).resolves.toMatchObject({
        tools: {
          search_standards: false,
        },
      })

      const rawResponse = await app.request("/api/config/raw", {
        headers: {
          "x-buddy-directory": repo,
        },
      })
      expect(rawResponse.status).toBe(200)
      const rawBody = (await rawResponse.json()) as {
        tools?: Record<string, boolean>
      }
      expect(rawBody.tools?.search_standards).toBeUndefined()
      expect(fs.readFileSync(path.join(repo, "buddy.jsonc"), "utf8")).not.toContain(
        "search_standards",
      )
    } finally {
      if (previousGlobal === undefined) {
        fs.rmSync(globalFile, { force: true })
      } else {
        writeFileSync(globalFile, previousGlobal)
      }

      await app.request("/api/global/config", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({}),
      })
    }
  })

  test("returns the default notebook home and persists updates", async () => {
    const globalFile = path.join(Global.Path.config, "buddy.jsonc")
    fs.mkdirSync(path.dirname(globalFile), { recursive: true })
    const previousGlobal = fs.existsSync(globalFile)
      ? fs.readFileSync(globalFile, "utf8")
      : undefined
    const originalAllowedRoots = process.env.BUDDY_ALLOWED_DIRECTORY_ROOTS
    const configuredDirectory = path.join(Global.Path.home, "Notes", "Buddy")

    process.env.BUDDY_ALLOWED_DIRECTORY_ROOTS = "*"

    try {
      const getBefore = await app.request("/api/global/notebook-home")
      expect(getBefore.status).toBe(200)
      const beforeBody = (await getBefore.json()) as {
        configuredDirectory?: string
        defaultDirectory: string
        resolvedDirectory: string
        inboxDirectory: string
        inboxName: string
      }

      expect(beforeBody.resolvedDirectory).toBe(
        beforeBody.configuredDirectory ?? beforeBody.defaultDirectory,
      )
      expect(beforeBody.inboxDirectory).toBe(path.join(beforeBody.resolvedDirectory, "Inbox"))
      expect(beforeBody.inboxName).toBe("Inbox")

      const putResponse = await app.request("/api/global/notebook-home", {
        method: "PUT",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          directory: configuredDirectory,
        }),
      })
      expect(putResponse.status).toBe(200)

      const afterBody = (await putResponse.json()) as {
        configuredDirectory?: string
        resolvedDirectory: string
      }
      expect(afterBody.configuredDirectory).toBe(configuredDirectory)
      expect(afterBody.resolvedDirectory).toBe(configuredDirectory)

      const getAfter = await app.request("/api/global/config")
      expect(getAfter.status).toBe(200)
      await expect(getAfter.json()).resolves.toMatchObject({
        notebook_home: configuredDirectory,
      })
    } finally {
      if (originalAllowedRoots === undefined) {
        delete process.env.BUDDY_ALLOWED_DIRECTORY_ROOTS
      } else {
        process.env.BUDDY_ALLOWED_DIRECTORY_ROOTS = originalAllowedRoots
      }

      if (previousGlobal === undefined) {
        fs.rmSync(globalFile, { force: true })
      } else {
        writeFileSync(globalFile, previousGlobal)
      }

      await app.request("/api/global/config", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({}),
      })
    }
  })

  test("lists managed notebooks from buddy home", async () => {
    const globalFile = path.join(Global.Path.config, "buddy.jsonc")
    fs.mkdirSync(path.dirname(globalFile), { recursive: true })
    const previousGlobal = fs.existsSync(globalFile)
      ? fs.readFileSync(globalFile, "utf8")
      : undefined
    const originalAllowedRoots = process.env.BUDDY_ALLOWED_DIRECTORY_ROOTS
    const notebookHome = path.join(Global.Path.home, "Notes", "Buddy-Managed-List-Test")
    const algebraDirectory = path.join(notebookHome, "Algebra")
    const inboxDirectory = path.join(notebookHome, "Inbox")
    const nestedFile = path.join(notebookHome, "README.txt")

    process.env.BUDDY_ALLOWED_DIRECTORY_ROOTS = "*"

    try {
      fs.mkdirSync(algebraDirectory, { recursive: true })
      fs.mkdirSync(inboxDirectory, { recursive: true })
      writeFileSync(nestedFile, "ignore me\n")

      const putResponse = await app.request("/api/global/notebook-home", {
        method: "PUT",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          directory: notebookHome,
        }),
      })
      expect(putResponse.status).toBe(200)

      const listResponse = await app.request("/api/global/notebooks")
      expect(listResponse.status).toBe(200)
      await expect(listResponse.json()).resolves.toEqual([
        {
          name: "Algebra",
          directory: algebraDirectory,
        },
        {
          name: "Inbox",
          directory: inboxDirectory,
        },
      ])
    } finally {
      if (originalAllowedRoots === undefined) {
        delete process.env.BUDDY_ALLOWED_DIRECTORY_ROOTS
      } else {
        process.env.BUDDY_ALLOWED_DIRECTORY_ROOTS = originalAllowedRoots
      }

      fs.rmSync(notebookHome, { recursive: true, force: true })

      if (previousGlobal === undefined) {
        fs.rmSync(globalFile, { force: true })
      } else {
        writeFileSync(globalFile, previousGlobal)
      }

      await app.request("/api/global/config", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({}),
      })
    }
  })

  test("rejects relative notebook_home in global config", async () => {
    const response = await app.request("/api/global/config", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        notebook_home: "relative-path",
      }),
    })

    expect(response.status).toBe(400)
  })

  test("returns 400 for invalid project config on provider listing", async () => {
    const repo = createGitRepo("buddy-route-config-providers-invalid")
    writeFileSync(path.join(repo, "buddy.jsonc"), ["{", '  "model":', "  ", ""].join("\n"))

    const response = await app.request("/api/config/providers", {
      headers: {
        "x-buddy-directory": repo,
      },
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: expect.any(String),
    })
  })

  test("returns 400 when project config hides every Buddy persona", async () => {
    const repo = createGitRepo("buddy-route-config-personas-invalid")
    writeFileSync(
      path.join(repo, "buddy.jsonc"),
      JSON.stringify(
        {
          personas: {
            buddy: {
              hidden: true,
            },
            "code-buddy": {
              hidden: true,
            },
            "math-buddy": {
              hidden: true,
            },
            "reading-buddy": {
              hidden: true,
            },
          },
        },
        null,
        2,
      ) + "\n",
    )

    const response = await app.request("/api/config/personas", {
      headers: {
        "x-buddy-directory": repo,
      },
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining("Invalid config:"),
    })
  })

  test("returns 400 when a persona override removes its inherited default surface", async () => {
    const repo = createGitRepo("buddy-route-config-default-surface-invalid")
    writeFileSync(
      path.join(repo, "buddy.jsonc"),
      JSON.stringify(
        {
          personas: {
            "code-buddy": {
              surfaces: ["curriculum"],
            },
          },
        },
        null,
        2,
      ) + "\n",
    )

    const response = await app.request("/api/config/personas", {
      headers: {
        "x-buddy-directory": repo,
      },
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining("Invalid config:"),
    })
  })
})
