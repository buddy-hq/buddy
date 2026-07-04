import { describe, expect, test } from "bun:test"
import path from "node:path"
import { writeFileSync } from "node:fs"
import { Config, JsonError } from "@buddy/backend/config"
import { InvalidError } from "@buddy/backend/config"
import { writeProjectConfig } from "../helpers/project-config"
import { createGitRepo } from "../helpers/repo"

describe("config jsonc", () => {
  test("parses comments and trailing commas", async () => {
    const repo = createGitRepo("buddy-config-jsonc")
    writeProjectConfig(
      repo,
      [
        "{",
        "  // JSONC comment",
        '  "default_persona": "code-buddy",',
        '  "model": "anthropic/k2p5",',
        "}",
        "",
      ].join("\n"),
    )

    const cfg = await Config.getProject(repo)

    expect(cfg.default_persona).toBe("code-buddy")
    expect(cfg.model).toBe("anthropic/k2p5")
  })

  test("returns line and column diagnostics for invalid jsonc", async () => {
    const repo = createGitRepo("buddy-config-jsonc-invalid")
    const badConfig = path.join(repo, "bad.jsonc")
    writeFileSync(badConfig, ["{", '  "model": ', "  ", ""].join("\n"))

    const previous = process.env.BUDDY_CONFIG
    process.env.BUDDY_CONFIG = badConfig

    try {
      await expect(Config.getProject(repo)).rejects.toBeInstanceOf(JsonError)
    } finally {
      if (previous === undefined) {
        delete process.env.BUDDY_CONFIG
      } else {
        process.env.BUDDY_CONFIG = previous
      }
    }
  })

  test("rejects configurations that hide every Buddy persona", async () => {
    const repo = createGitRepo("buddy-config-jsonc-hidden-all")
    writeProjectConfig(
      repo,
      [
        "{",
        '  "personas": {',
        '    "buddy": { "hidden": true },',
        '    "code-buddy": { "hidden": true }',
        "  }",
        "}",
        "",
      ].join("\n"),
    )

    await expect(Config.getProject(repo)).rejects.toBeInstanceOf(InvalidError)
  })
})
