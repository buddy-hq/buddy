import { describe, expect, test } from "bun:test"
import path from "node:path"
import fs from "node:fs"
import { writeFileSync } from "node:fs"
import { app } from "../../src/index.ts"
import { Config } from "../../src/config"
import { Global } from "../../src/storage"
import { projectConfigFile, writeProjectConfig } from "../helpers/project-config"
import { createGitRepo } from "../helpers/repo"
import {
  parseJsonObject,
  parsePromptString,
  requireJsonArray,
  requireJsonObject,
  requireString,
} from "../helpers/parse"

function normalizePathForAssertion(value: string): string {
  if (process.platform !== "darwin") {
    return value
  }
  return value.startsWith("/private/") ? value.slice("/private".length) : value
}

describe("config routes", () => {
  test("orders teaching-buddy first when teaching is the primary use", async () => {
    await using repo = await createGitRepo("buddy-route-config-personas-teach-default")
    writeProjectConfig(
      repo.path,
      JSON.stringify({
        personalization: {
          primary_use: "teach",
        },
      }),
    )

    const response = await app.request("/api/config/personas", {
      headers: {
        "x-buddy-directory": repo.path,
      },
    })

    expect(response.status).toBe(200)
    const personas = requireJsonArray(await response.json())
    expect(parseJsonObject(personas[0])?.id).toBe("teaching-buddy")
  })

  test("patches and returns project config", async () => {
    await using repo = await createGitRepo("buddy-route-config-project")

    const patchResponse = await app.request("/api/config", {
      method: "PATCH",
      headers: {
        "x-buddy-directory": repo.path,
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
        "x-buddy-directory": repo.path,
      },
    })

    expect(getResponse.status).toBe(200)
    const body = requireJsonObject(await getResponse.json())

    expect(body.default_persona).toBe("teaching-buddy")
    expect(body.model).toBe("anthropic/route-project")
    expect(fs.existsSync(projectConfigFile(repo.path))).toBe(true)
  })

  test("rejects misspelled project and global config patch fields", async () => {
    await using repo = await createGitRepo("buddy-route-config-rejects-typos")

    const projectResponse = await app.request("/api/config", {
      method: "PATCH",
      headers: {
        "x-buddy-directory": repo.path,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        conscise_responses: true,
        defualt_persona: "code",
      }),
    })
    expect(projectResponse.status).toBe(400)

    const globalResponse = await app.request("/api/global/config", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        conscise_responses: true,
        defualt_persona: "code",
      }),
    })
    expect(globalResponse.status).toBe(400)
  })

  test("preserves concurrent project config patches", async () => {
    await using repo = await createGitRepo("buddy-route-config-project-concurrent")
    const nestedDirectory = path.join(repo.path, "nested")
    fs.mkdirSync(nestedDirectory)

    const [personaResponse, modelResponse] = await Promise.all([
      app.request("/api/config", {
        method: "PATCH",
        headers: {
          "x-buddy-directory": repo.path,
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
      headers: { "x-buddy-directory": repo.path },
    })
    expect(getResponse.status).toBe(200)
    expect(await getResponse.json()).toMatchObject({
      default_persona: "teaching-buddy",
      model: "anthropic/project-concurrent-patch",
    })
  })

  test("uses only the project root config when nested folders are opened", async () => {
    await using repo = await createGitRepo("buddy-route-config-root-only")
    const nested = path.join(repo.path, "nested")
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
    const body = requireJsonObject(await getResponse.json())

    expect(body.default_persona).toBe("teaching-buddy")
    expect(fs.readFileSync(projectConfigFile(nested), "utf8")).toContain(
      '"default_persona":"buddy"',
    )
    expect(fs.existsSync(projectConfigFile(repo.path))).toBe(true)
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
      const afterBody = requireJsonObject(await getAfter.json())
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

  test("keeps working with settings written by a newer Buddy version", async () => {
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
            future_setting: { enabled: true },
            model: "anthropic/original-global",
            personalization: {
              primary_use: "learn",
              future_preference: "keep-me",
            },
          },
          null,
          2,
        ) + "\n",
      )

      const updated = await Config.updateGlobal({ model: "anthropic/updated-global" })
      expect(updated.model).toBe("anthropic/updated-global")
      expect(updated).not.toHaveProperty("future_setting")
      expect(updated.personalization).not.toHaveProperty("future_preference")

      const saved = requireJsonObject(JSON.parse(fs.readFileSync(globalFile, "utf8")))
      const savedPersonalization = parseJsonObject(saved.personalization)
      expect(saved.future_setting).toEqual({ enabled: true })
      expect(saved.model).toBe("anthropic/updated-global")
      expect(savedPersonalization?.future_preference).toBe("keep-me")
    } finally {
      if (previousGlobal === undefined) {
        fs.rmSync(globalFile, { force: true })
      } else {
        writeFileSync(globalFile, previousGlobal)
      }

      await Config.updateGlobal({})
    }
  })

  test("preserves unknown settings and deletes omitted known settings in global buddy.json", async () => {
    const globalJsonc = path.join(Global.Path.config, "buddy.jsonc")
    const globalJson = path.join(Global.Path.config, "buddy.json")
    fs.mkdirSync(Global.Path.config, { recursive: true })
    const previousJsonc = fs.existsSync(globalJsonc)
      ? fs.readFileSync(globalJsonc, "utf8")
      : undefined
    const previousJson = fs.existsSync(globalJson) ? fs.readFileSync(globalJson, "utf8") : undefined

    try {
      fs.rmSync(globalJsonc, { force: true })
      writeFileSync(
        globalJson,
        JSON.stringify(
          {
            model: "anthropic/original-global-json",
            small_model: "anthropic/remove-global-json",
            future_setting: { enabled: true },
          },
          null,
          2,
        ) + "\n",
      )

      await Config.replaceGlobal(Config.Info.parse({ model: "anthropic/updated-global-json" }))

      const saved = requireJsonObject(JSON.parse(fs.readFileSync(globalJson, "utf8")))
      expect(saved.model).toBe("anthropic/updated-global-json")
      expect(saved.small_model).toBeUndefined()
      expect(saved.future_setting).toEqual({ enabled: true })
    } finally {
      fs.rmSync(globalJsonc, { force: true })
      fs.rmSync(globalJson, { force: true })
      if (previousJsonc !== undefined) writeFileSync(globalJsonc, previousJsonc)
      if (previousJson !== undefined) writeFileSync(globalJson, previousJson)

      await Config.updateGlobal({})
      if (previousJsonc === undefined && previousJson === undefined) {
        fs.rmSync(globalJsonc, { force: true })
      }
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

      const body = requireJsonObject(await removeResponse.json())
      const bodyMcp = parseJsonObject(body.mcp)
      expect(body.model).toBe("anthropic/global-delete-regression")
      expect(bodyMcp?.linear).toBeUndefined()
      expect(bodyMcp?.docs).toEqual({
        type: "remote",
        url: "https://example.com/mcp",
        enabled: false,
      })

      const getAfter = await app.request("/api/global/config")
      expect(getAfter.status).toBe(200)
      const afterBody = requireJsonObject(await getAfter.json())
      const afterMcp = parseJsonObject(afterBody.mcp)
      expect(afterMcp?.linear).toBeUndefined()
      expect(afterMcp?.docs).toBeDefined()
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
      const afterBody = requireJsonObject(await getAfter.json())
      const afterMcp = parseJsonObject(afterBody.mcp)
      expect(afterBody.model).toBe("anthropic/global-concurrent-patch")
      expect(afterMcp?.linear).toBeUndefined()
      expect(afterMcp?.docs).toEqual({
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
    await using repo = await createGitRepo("buddy-route-config-raw")
    const globalFile = path.join(Global.Path.config, "buddy.jsonc")
    fs.mkdirSync(path.dirname(globalFile), { recursive: true })
    const previousGlobal = fs.existsSync(globalFile)
      ? fs.readFileSync(globalFile, "utf8")
      : undefined

    writeProjectConfig(
      repo.path,
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
          "x-buddy-directory": repo.path,
        },
      })

      expect(rawResponse.status).toBe(200)
      const rawBody = requireJsonObject(await rawResponse.json())
      const rawTools = parseJsonObject(rawBody.tools)
      expect(rawBody.default_persona).toBe("teaching-buddy")
      expect(rawBody.model).toBeUndefined()
      expect(rawTools?.get_next_standards).toBe(true)
      expect(rawTools?.search_standards).toBeUndefined()

      const mergedResponse = await app.request("/api/config", {
        headers: {
          "x-buddy-directory": repo.path,
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
    await using repo = await createGitRepo("buddy-route-config-no-global-copy")
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
          "x-buddy-directory": repo.path,
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

      const configFile = projectConfigFile(repo.path)
      expect(fs.readFileSync(configFile, "utf8")).toContain('"default_persona": "teaching-buddy"')
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
    await using repo = await createGitRepo("buddy-route-config-remove-override")
    const globalFile = path.join(Global.Path.config, "buddy.jsonc")
    fs.mkdirSync(path.dirname(globalFile), { recursive: true })
    const previousGlobal = fs.existsSync(globalFile)
      ? fs.readFileSync(globalFile, "utf8")
      : undefined

    writeProjectConfig(
      repo.path,
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
          "x-buddy-directory": repo.path,
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
          "x-buddy-directory": repo.path,
        },
      })
      expect(rawResponse.status).toBe(200)
      const rawBody = requireJsonObject(await rawResponse.json())
      expect(parseJsonObject(rawBody.tools)?.search_standards).toBeUndefined()
      expect(fs.readFileSync(projectConfigFile(repo.path), "utf8")).not.toContain(
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
      const beforeBody = requireJsonObject(await getBefore.json())
      const beforeResolvedDirectory = requireString(beforeBody.resolvedDirectory)
      const beforeDefaultDirectory = requireString(beforeBody.defaultDirectory)
      const beforeConfiguredDirectory = parsePromptString(beforeBody.configuredDirectory)

      expect(beforeResolvedDirectory).toBe(beforeConfiguredDirectory ?? beforeDefaultDirectory)
      expect(beforeBody.inboxDirectory).toBe(path.join(beforeResolvedDirectory, "Inbox"))
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

      const afterBody = requireJsonObject(await putResponse.json())
      expect(
        normalizePathForAssertion(parsePromptString(afterBody.configuredDirectory) ?? ""),
      ).toBe(normalizePathForAssertion(configuredDirectory))
      expect(normalizePathForAssertion(requireString(afterBody.resolvedDirectory))).toBe(
        normalizePathForAssertion(configuredDirectory),
      )

      const getAfter = await app.request("/api/global/config")
      expect(getAfter.status).toBe(200)
      const persistedGlobal = requireJsonObject(await getAfter.json())
      expect(
        normalizePathForAssertion(parsePromptString(persistedGlobal.notebook_home) ?? ""),
      ).toBe(normalizePathForAssertion(configuredDirectory))
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
      const listBody = requireJsonArray(await listResponse.json())
      expect(
        listBody.map((entry) => {
          const notebook = requireJsonObject(entry)
          return {
            name: notebook.name,
            directory: normalizePathForAssertion(requireString(notebook.directory)),
          }
        }),
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
    await using repo = await createGitRepo("buddy-route-config-providers-invalid")
    writeProjectConfig(repo.path, ["{", '  "model":', "  ", ""].join("\n"))

    const response = await app.request("/api/config/providers", {
      headers: {
        "x-buddy-directory": repo.path,
      },
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: expect.any(String),
    })
  })

  test("returns 400 when project config hides every Buddy persona", async () => {
    await using repo = await createGitRepo("buddy-route-config-personas-invalid")
    writeProjectConfig(
      repo.path,
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
        "x-buddy-directory": repo.path,
      },
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining("Invalid config:"),
    })
  })

  test("returns 400 when a persona override removes its inherited default surface", async () => {
    await using repo = await createGitRepo("buddy-route-config-default-surface-invalid")
    writeProjectConfig(
      repo.path,
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
        "x-buddy-directory": repo.path,
      },
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining("Invalid config:"),
    })
  })
})
