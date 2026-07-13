import { describe, expect, test } from "bun:test"
import path from "node:path"
import fs from "node:fs"
import { writeFileSync } from "node:fs"
import { app } from "../../src/index.ts"
import { Config } from "../../src/config"
import { Global } from "../../src/storage"
import { projectConfigFile, writeProjectConfig } from "../helpers/project-config"
import { createGitRepo } from "../helpers/repo"

function normalizePathForAssertion(value: string): string {
  if (process.platform !== "darwin") {
    return value
  }
  return value.startsWith("/private/") ? value.slice("/private".length) : value
}

describe("config routes", () => {
  test("orders teaching-buddy first when teaching is the primary use", async () => {
    const repo = createGitRepo("buddy-route-config-personas-teach-default")
    writeProjectConfig(
      repo,
      JSON.stringify({
        personalization: {
          primary_use: "teach",
        },
      }),
    )

    const response = await app.request("/api/config/personas", {
      headers: {
        "x-buddy-directory": repo,
      },
    })

    expect(response.status).toBe(200)
    const personas = (await response.json()) as Array<{ id: string }>
    expect(personas[0]?.id).toBe("teaching-buddy")
  })

  test("patches and returns project config", async () => {
    const repo = createGitRepo("buddy-route-config-project")

    const patchResponse = await app.request("/api/config", {
      method: "PATCH",
      headers: {
        "x-buddy-directory": repo,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        default_persona: "teaching-buddy",
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

    expect(body.default_persona).toBe("teaching-buddy")
    expect(body.model).toBe("anthropic/route-project")
    expect(fs.existsSync(projectConfigFile(repo))).toBe(true)
  })

  test("preserves concurrent project config patches", async () => {
    const repo = createGitRepo("buddy-route-config-project-concurrent")
    const nestedDirectory = path.join(repo, "nested")
    fs.mkdirSync(nestedDirectory)

    const [personaResponse, modelResponse] = await Promise.all([
      app.request("/api/config", {
        method: "PATCH",
        headers: {
          "x-buddy-directory": repo,
          "content-type": "application/json",
        },
        body: JSON.stringify({ default_persona: "teaching-buddy" }),
      }),
      app.request("/api/config", {
        method: "PATCH",
        headers: {
          "x-buddy-directory": nestedDirectory,
          "content-type": "application/json",
        },
        body: JSON.stringify({ model: "anthropic/project-concurrent-patch" }),
      }),
    ])

    expect(personaResponse.status).toBe(200)
    expect(modelResponse.status).toBe(200)

    const getResponse = await app.request("/api/config", {
      headers: { "x-buddy-directory": repo },
    })
    expect(getResponse.status).toBe(200)
    expect(await getResponse.json()).toMatchObject({
      default_persona: "teaching-buddy",
      model: "anthropic/project-concurrent-patch",
    })
  })

  test("uses only the project root config when nested folders are opened", async () => {
    const repo = createGitRepo("buddy-route-config-root-only")
    const nested = path.join(repo, "nested")
    fs.mkdirSync(nested, { recursive: true })
    writeProjectConfig(nested, '{"default_persona":"buddy"}\n')

    const patchResponse = await app.request("/api/config", {
      method: "PATCH",
      headers: {
        "x-buddy-directory": nested,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        default_persona: "teaching-buddy",
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

    expect(body.default_persona).toBe("teaching-buddy")
    expect(fs.readFileSync(projectConfigFile(nested), "utf8")).toContain(
      '"default_persona":"buddy"',
    )
    expect(fs.existsSync(projectConfigFile(repo))).toBe(true)
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

  test("deletes nested global config keys through patch", async () => {
    const globalFile = path.join(Global.Path.config, "buddy.jsonc")
    fs.mkdirSync(path.dirname(globalFile), { recursive: true })
    const previousGlobal = fs.existsSync(globalFile)
      ? fs.readFileSync(globalFile, "utf8")
      : undefined

    try {
      const seedResponse = await app.request("/api/global/config", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "anthropic/global-delete-regression",
          mcp: {
            linear: {
              type: "remote",
              url: "https://mcp.linear.app/mcp",
              enabled: true,
            },
            docs: {
              type: "remote",
              url: "https://example.com/mcp",
              enabled: false,
            },
          },
        }),
      })
      expect(seedResponse.status).toBe(200)

      const removeResponse = await app.request("/api/global/config", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          mcp: {
            linear: null,
          },
        }),
      })
      expect(removeResponse.status).toBe(200)

      const body = (await removeResponse.json()) as {
        model?: string
        mcp?: Record<string, unknown>
      }
      expect(body.model).toBe("anthropic/global-delete-regression")
      expect(body.mcp?.linear).toBeUndefined()
      expect(body.mcp?.docs).toEqual({
        type: "remote",
        url: "https://example.com/mcp",
        enabled: false,
      })

      const getAfter = await app.request("/api/global/config")
      expect(getAfter.status).toBe(200)
      const afterBody = (await getAfter.json()) as { mcp?: Record<string, unknown> }
      expect(afterBody.mcp?.linear).toBeUndefined()
      expect(afterBody.mcp?.docs).toBeDefined()
      expect(fs.readFileSync(globalFile, "utf8")).not.toContain('"linear"')
    } finally {
      if (previousGlobal === undefined) {
        fs.rmSync(globalFile, { force: true })
      } else {
        writeFileSync(globalFile, previousGlobal)
      }

      await Config.updateGlobal({})
    }
  })

  test("preserves concurrent global config patches", async () => {
    const globalFile = path.join(Global.Path.config, "buddy.jsonc")
    fs.mkdirSync(path.dirname(globalFile), { recursive: true })
    const previousGlobal = fs.existsSync(globalFile)
      ? fs.readFileSync(globalFile, "utf8")
      : undefined

    try {
      await Config.replaceGlobal({})
      const seedResponse = await app.request("/api/global/config", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          mcp: {
            linear: {
              type: "remote",
              url: "https://mcp.linear.app/mcp",
              enabled: true,
            },
            docs: {
              type: "remote",
              url: "https://example.com/mcp",
              enabled: false,
            },
          },
        }),
      })
      expect(seedResponse.status).toBe(200)

      const [removeResponse, modelResponse] = await Promise.all([
        app.request("/api/global/config", {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            mcp: {
              linear: null,
            },
          }),
        }),
        app.request("/api/global/config", {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: "anthropic/global-concurrent-patch",
          }),
        }),
      ])
      expect(removeResponse.status).toBe(200)
      expect(modelResponse.status).toBe(200)

      const getAfter = await app.request("/api/global/config")
      expect(getAfter.status).toBe(200)
      const afterBody = (await getAfter.json()) as {
        model?: string
        mcp?: Record<string, unknown>
      }
      expect(afterBody.model).toBe("anthropic/global-concurrent-patch")
      expect(afterBody.mcp?.linear).toBeUndefined()
      expect(afterBody.mcp?.docs).toEqual({
        type: "remote",
        url: "https://example.com/mcp",
        enabled: false,
      })
    } finally {
      if (previousGlobal === undefined) {
        fs.rmSync(globalFile, { force: true })
      } else {
        writeFileSync(globalFile, previousGlobal)
      }

      await Config.updateGlobal({})
    }
  })

  test("returns raw notebook config without merged global defaults", async () => {
    const repo = createGitRepo("buddy-route-config-raw")
    const globalFile = path.join(Global.Path.config, "buddy.jsonc")
    fs.mkdirSync(path.dirname(globalFile), { recursive: true })
    const previousGlobal = fs.existsSync(globalFile)
      ? fs.readFileSync(globalFile, "utf8")
      : undefined

    writeProjectConfig(
      repo,
      JSON.stringify(
        {
          default_persona: "teaching-buddy",
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
      expect(rawBody.default_persona).toBe("teaching-buddy")
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
        default_persona: "teaching-buddy",
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
          default_persona: "teaching-buddy",
        }),
      })

      expect(patchResponse.status).toBe(200)
      await expect(patchResponse.json()).resolves.toMatchObject({
        default_persona: "teaching-buddy",
        model: "anthropic/route-global-only",
      })

      const configFile = projectConfigFile(repo)
      expect(fs.readFileSync(configFile, "utf8")).toContain(
        '"default_persona": "teaching-buddy"',
      )
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

    writeProjectConfig(
      repo,
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
      expect(fs.readFileSync(projectConfigFile(repo), "utf8")).not.toContain("search_standards")
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
      expect(normalizePathForAssertion(afterBody.configuredDirectory ?? "")).toBe(
        normalizePathForAssertion(configuredDirectory),
      )
      expect(normalizePathForAssertion(afterBody.resolvedDirectory)).toBe(
        normalizePathForAssertion(configuredDirectory),
      )

      const getAfter = await app.request("/api/global/config")
      expect(getAfter.status).toBe(200)
      const persistedGlobal = (await getAfter.json()) as {
        notebook_home?: string
      }
      expect(normalizePathForAssertion(persistedGlobal.notebook_home ?? "")).toBe(
        normalizePathForAssertion(configuredDirectory),
      )
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
      const listBody = (await listResponse.json()) as Array<{
        name: string
        directory: string
      }>
      expect(
        listBody.map((entry) => ({
          name: entry.name,
          directory: normalizePathForAssertion(entry.directory),
        })),
      ).toEqual([
        {
          name: "Algebra",
          directory: normalizePathForAssertion(algebraDirectory),
        },
        {
          name: "Inbox",
          directory: normalizePathForAssertion(inboxDirectory),
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
    writeProjectConfig(repo, ["{", '  "model":', "  ", ""].join("\n"))

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
    writeProjectConfig(
      repo,
      JSON.stringify(
        {
          personas: {
            buddy: {
              hidden: true,
            },
            "teaching-buddy": {
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
    writeProjectConfig(
      repo,
      JSON.stringify(
        {
          personas: {
            "teaching-buddy": {
              surfaces: ["flashcard"],
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
