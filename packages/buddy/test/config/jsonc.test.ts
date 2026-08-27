import { describe, expect, test } from "bun:test"
import path from "node:path"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { Config, InvalidError, JsonError } from "@buddy/backend/config"
import { updateKnownConfigDocument } from "../../src/config/contract/document"
import { projectConfigFile, writeProjectConfig } from "../helpers/project-config"
import { parseJsonObject } from "../helpers/parse"
import { createGitRepo } from "../helpers/repo"

describe("config jsonc", () => {
  test("parses comments and trailing commas", async () => {
    await using repository = await createGitRepo("buddy-config-jsonc")
    writeProjectConfig(
      repository.path,
      [
        "{",
        "  // JSONC comment",
        '  "default_persona": "teaching-buddy",',
        '  "model": "anthropic/k2p5",',
        "}",
        "",
      ].join("\n"),
    )

    const cfg = await Config.getProject(repository.path)

    expect(cfg.default_persona).toBe("teaching-buddy")
    expect(cfg.model).toBe("anthropic/k2p5")
  })

  test("returns line and column diagnostics for invalid jsonc", async () => {
    await using repository = await createGitRepo("buddy-config-jsonc-invalid")
    const badConfig = path.join(repository.path, "bad.jsonc")
    writeFileSync(badConfig, ["{", '  "model": ', "  ", ""].join("\n"))

    const previous = process.env.BUDDY_CONFIG
    process.env.BUDDY_CONFIG = badConfig

    try {
      await expect(Config.getProject(repository.path)).rejects.toBeInstanceOf(JsonError)
    } finally {
      if (previous === undefined) {
        delete process.env.BUDDY_CONFIG
      } else {
        process.env.BUDDY_CONFIG = previous
      }
    }
  })

  test("reports the concrete file path when a config document edit cannot be parsed", () => {
    const filepath = "/test/notebook/.buddy/buddy.jsonc"
    let thrown: unknown
    try {
      updateKnownConfigDocument("{ invalid", {}, {}, filepath)
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(JsonError)
    if (!(thrown instanceof JsonError)) throw thrown
    expect(thrown.data.path).toBe(filepath)
  })

  test("rejects configurations that hide every Buddy persona", async () => {
    await using repository = await createGitRepo("buddy-config-jsonc-hidden-all")
    writeProjectConfig(
      repository.path,
      [
        "{",
        '  "personas": {',
        '    "buddy": { "hidden": true },',
        '    "teaching-buddy": { "hidden": true }',
        "  }",
        "}",
        "",
      ].join("\n"),
    )

    await expect(Config.getProject(repository.path)).rejects.toBeInstanceOf(InvalidError)
  })

  test.each(["buddy.jsonc", "buddy.json"])(
    "ignores and preserves settings from newer versions in %s",
    async (filename) => {
      await using repository = await createGitRepo(`buddy-config-forward-compatible-${filename}`)
      const filepath = projectConfigFile(repository.path, filename)
      mkdirSync(path.dirname(filepath), { recursive: true })
      writeFileSync(
        filepath,
        JSON.stringify(
          {
            future_setting: { enabled: true },
            model: "anthropic/original",
            personalization: {
              primary_use: "learn",
              future_preference: "keep-me",
            },
          },
          null,
          2,
        ) + "\n",
      )

      const config = await Config.getProject(repository.path)
      expect(config).not.toHaveProperty("future_setting")
      expect(config.personalization).not.toHaveProperty("future_preference")

      await Config.updateProject(
        repository.path,
        Config.ProjectInfo.parse({
          model: "anthropic/updated",
          personalization: { primary_use: "teach" },
        }),
      )

      const saved = parseJsonObject(JSON.parse(readFileSync(filepath, "utf8")))
      const savedPersonalization = parseJsonObject(saved?.personalization)
      expect(saved?.future_setting).toEqual({ enabled: true })
      expect(saved?.model).toBe("anthropic/updated")
      expect(savedPersonalization?.primary_use).toBe("teach")
      expect(savedPersonalization?.future_preference).toBe("keep-me")
    },
  )

  test.each(["buddy.jsonc", "buddy.json"])(
    "preserves unknown nested settings when their known parent is removed from %s",
    async (filename) => {
      await using repository = await createGitRepo(
        `buddy-config-preserve-unknown-parent-${filename}`,
      )
      const filepath = projectConfigFile(repository.path, filename)
      mkdirSync(path.dirname(filepath), { recursive: true })
      writeFileSync(
        filepath,
        JSON.stringify(
          {
            personalization: {
              primary_use: "learn",
              future_preference: "keep-me",
            },
          },
          null,
          2,
        ) + "\n",
      )

      await Config.updateProject(repository.path, Config.ProjectInfo.parse({}))

      const saved = parseJsonObject(JSON.parse(readFileSync(filepath, "utf8")))
      expect(saved?.personalization).toEqual({ future_preference: "keep-me" })
    },
  )

  test.each(["buddy.jsonc", "buddy.json"])(
    "updates normalized permission shorthand in %s",
    async (filename) => {
      await using repository = await createGitRepo(`buddy-config-permission-shorthand-${filename}`)
      const filepath = projectConfigFile(repository.path, filename)
      mkdirSync(path.dirname(filepath), { recursive: true })
      writeFileSync(filepath, '{"permission": "allow"}\n')

      await Config.updateProject(
        repository.path,
        Config.ProjectInfo.parse({ permission: { bash: "deny" } }),
      )

      const saved = parseJsonObject(JSON.parse(readFileSync(filepath, "utf8")))
      expect(saved?.permission).toEqual({ bash: "deny" })
    },
  )

  test("preserves unaffected JSONC comments and unknown fields while updating known fields", async () => {
    await using repository = await createGitRepo("buddy-config-forward-compatible-comments")
    const filepath = projectConfigFile(repository.path)
    mkdirSync(path.dirname(filepath), { recursive: true })
    writeFileSync(
      filepath,
      [
        "{",
        "  // Keep the model explanation",
        '  "model": "anthropic/original", // Keep the inline comment',
        '  "small_model": "anthropic/remove-me",',
        '  "future_setting": true // Keep the future setting comment',
        "}",
        "",
      ].join("\n"),
    )

    await Config.updateProject(
      repository.path,
      Config.ProjectInfo.parse({ model: "anthropic/updated" }),
    )

    const saved = readFileSync(filepath, "utf8")
    expect(saved).toContain("// Keep the model explanation")
    expect(saved).toContain("// Keep the future setting comment")
    expect(saved).toContain('"future_setting": true')
    expect(saved).toContain('"model": "anthropic/updated"')
    expect(saved).not.toContain("small_model")
  })

  test("still rejects unsupported values for known settings", async () => {
    await using repository = await createGitRepo("buddy-config-reject-future-enum")
    writeProjectConfig(repository.path, '{"default_persona": "future-persona"}\n')

    await expect(Config.getProjectFile(repository.path)).rejects.toBeInstanceOf(InvalidError)
  })

  test("still rejects known global-only settings in project config", async () => {
    await using repository = await createGitRepo("buddy-config-reject-global-only-project-setting")
    writeProjectConfig(repository.path, '{"concise_responses": true}\n')

    await expect(Config.getProjectFile(repository.path)).rejects.toBeInstanceOf(InvalidError)
  })

  test("still rejects unsupported MCP transports", async () => {
    await using repository = await createGitRepo("buddy-config-reject-unsupported-mcp")
    writeProjectConfig(
      repository.path,
      JSON.stringify({
        mcp: {
          future: {
            type: "future-transport",
            url: "https://future.example.com",
            enabled: true,
          },
        },
      }),
    )

    await expect(Config.getProjectFile(repository.path)).rejects.toBeInstanceOf(InvalidError)
  })

  test.each(["buddy.jsonc", "buddy.json"])(
    "replaces known MCP fields and preserves unknown properties in %s",
    async (filename) => {
      await using repository = await createGitRepo(`buddy-config-mcp-preserve-unknown-${filename}`)
      const filepath = projectConfigFile(repository.path, filename)
      mkdirSync(path.dirname(filepath), { recursive: true })
      writeFileSync(
        filepath,
        JSON.stringify(
          {
            future_setting: true,
            mcp: {
              docs: {
                type: "remote",
                url: "https://existing.example.com",
                enabled: true,
                future_option: "keep-me",
              },
            },
          },
          null,
          2,
        ) + "\n",
      )

      await Config.setProjectMcp(
        repository.path,
        "docs",
        Config.Mcp.parse({
          type: "local",
          command: ["docs-server"],
        }),
      )

      const saved = parseJsonObject(JSON.parse(readFileSync(filepath, "utf8")))
      const savedMcp = parseJsonObject(saved?.mcp)
      const savedDocs = parseJsonObject(savedMcp?.docs)
      expect(saved?.future_setting).toBe(true)
      expect(savedDocs).toEqual({
        type: "local",
        command: ["docs-server"],
        future_option: "keep-me",
      })
      expect(savedDocs?.url).toBeUndefined()
      expect(savedDocs?.enabled).toBeUndefined()
    },
  )

  test("still rejects malformed known MCP transports", async () => {
    await using repository = await createGitRepo("buddy-config-reject-malformed-known-mcp")
    writeProjectConfig(
      repository.path,
      JSON.stringify({
        mcp: {
          malformed: {
            type: "remote",
            enabled: true,
          },
        },
      }),
    )

    await expect(Config.getProjectFile(repository.path)).rejects.toBeInstanceOf(InvalidError)
  })

  test.each([
    ["buddy.jsonc", '{"default_persona": 42}\n', InvalidError],
    ["buddy.json", "{ this is not json", JsonError],
  ] as const)(
    "does not overwrite an invalid %s file",
    async (filename, invalidConfig, ErrorType) => {
      await using repository = await createGitRepo(`buddy-config-invalid-update-${filename}`)
      const filepath = projectConfigFile(repository.path, filename)
      mkdirSync(path.dirname(filepath), { recursive: true })
      writeFileSync(filepath, invalidConfig)

      await expect(
        Config.updateProject(
          repository.path,
          Config.ProjectInfo.parse({ model: "anthropic/repaired" }),
        ),
      ).rejects.toBeInstanceOf(ErrorType)

      expect(readFileSync(filepath, "utf8")).toBe(invalidConfig)
    },
  )

  test.each(["buddy.jsonc", "buddy.json"])(
    "rejects an ambiguous duplicate known key without modifying %s",
    async (filename) => {
      await using repository = await createGitRepo(`buddy-config-duplicate-key-${filename}`)
      const filepath = projectConfigFile(repository.path, filename)
      const original = [
        "{",
        '  "model": "anthropic/first",',
        '  "model": "anthropic/effective"',
        "}",
        "",
      ].join("\n")
      mkdirSync(path.dirname(filepath), { recursive: true })
      writeFileSync(filepath, original)

      await expect(Config.getProjectFile(repository.path)).rejects.toBeInstanceOf(InvalidError)

      await expect(
        Config.updateProject(
          repository.path,
          Config.ProjectInfo.parse({ model: "anthropic/updated" }),
        ),
      ).rejects.toBeInstanceOf(InvalidError)

      expect(readFileSync(filepath, "utf8")).toBe(original)
    },
  )

  test("keeps env and file references unexpanded when another setting changes", async () => {
    await using repository = await createGitRepo("buddy-config-preserve-references")
    const filepath = projectConfigFile(repository.path)
    const referencedFile = path.join(repository.path, "provider-url.txt")
    const envName = "BUDDY_CONFIG_REFERENCE_TEST_SECRET"
    const previousEnv = process.env[envName]
    process.env[envName] = "expanded-secret"
    writeFileSync(referencedFile, "https://expanded.example.com\n")
    mkdirSync(path.dirname(filepath), { recursive: true })
    writeFileSync(
      filepath,
      JSON.stringify(
        {
          provider: {
            openai: {
              options: {
                apiKey: `{env:${envName}}`,
                baseURL: `{file:${referencedFile}}`,
              },
            },
          },
        },
        null,
        2,
      ) + "\n",
    )

    try {
      const config = await Config.getProjectFile(repository.path)
      await Config.updateProject(
        repository.path,
        Config.ProjectInfo.parse({ ...config, model: "anthropic/updated" }),
      )

      const saved = readFileSync(filepath, "utf8")
      expect(saved).toContain(`{env:${envName}}`)
      expect(saved).toContain(`{file:${referencedFile}}`)
      expect(saved).not.toContain("expanded-secret")
      expect(saved).not.toContain("https://expanded.example.com")
    } finally {
      if (previousEnv === undefined) {
        delete process.env[envName]
      } else {
        process.env[envName] = previousEnv
      }
    }
  })

  test("removes the deprecated learner-memory master switch on write", async () => {
    await using repository = await createGitRepo("buddy-config-remove-legacy-memory-setting")
    const filepath = projectConfigFile(repository.path)
    mkdirSync(path.dirname(filepath), { recursive: true })
    writeFileSync(
      filepath,
      JSON.stringify({
        learner_memory: {
          master_enabled: true,
          enabled: true,
        },
      }),
    )

    const config = await Config.getProjectFile(repository.path)
    await Config.updateProject(
      repository.path,
      Config.ProjectInfo.parse({
        ...config,
        learner_memory: { ...config.learner_memory, enabled: false },
      }),
    )

    const saved = parseJsonObject(JSON.parse(readFileSync(filepath, "utf8")))
    expect(saved?.learner_memory).toEqual({ enabled: false })
  })
})
