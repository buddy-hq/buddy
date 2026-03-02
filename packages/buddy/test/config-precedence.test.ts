import { describe, expect, test } from "bun:test"
import os from "node:os"
import path from "node:path"
import fs from "node:fs"
import { mkdtempSync, writeFileSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { Config } from "../src/config/config.js"
import { Global } from "../src/storage/global.js"

function runGit(cwd: string, args: string[]) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
  })
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "git command failed")
  }
}

function createGitRepo(prefix: string) {
  const root = mkdtempSync(path.join(os.tmpdir(), `${prefix}-`))
  runGit(root, ["init", "-q"])
  writeFileSync(path.join(root, "README.md"), "# test\n")
  runGit(root, ["add", "README.md"])
  runGit(root, ["-c", "user.email=buddy@test.local", "-c", "user.name=Buddy Test", "commit", "-qm", "init"])
  return root
}

describe("config precedence", () => {
  test("applies precedence from global -> env file -> project root -> inline content", async () => {
    const repo = createGitRepo("buddy-config-precedence")
    const nested = path.join(repo, "nested")
    fs.mkdirSync(nested, { recursive: true })

    const customPath = path.join(repo, "custom.jsonc")
    writeFileSync(customPath, '{"model":"anthropic/custom"}\n')

    writeFileSync(path.join(repo, "buddy.jsonc"), '{"model":"anthropic/project"}\n')
    writeFileSync(path.join(nested, "buddy.jsonc"), '{"model":"anthropic/nested"}\n')

    const globalFile = path.join(Global.Path.config, "buddy.jsonc")
    fs.mkdirSync(path.dirname(globalFile), { recursive: true })
    const previousGlobal = fs.existsSync(globalFile) ? fs.readFileSync(globalFile, "utf8") : undefined

    const previousConfig = process.env.BUDDY_CONFIG
    const previousContent = process.env.BUDDY_CONFIG_CONTENT

    try {
      writeFileSync(globalFile, '{"model":"anthropic/global"}\n')
      process.env.BUDDY_CONFIG = customPath
      process.env.BUDDY_CONFIG_CONTENT = '{"model":"anthropic/inline"}'

      const cfg = await Config.getProject(nested)

      expect(cfg.model).toBe("anthropic/inline")

      delete process.env.BUDDY_CONFIG_CONTENT

      const withoutInline = await Config.getProject(nested)

      expect(withoutInline.model).toBe("anthropic/project")
    } finally {
      if (previousConfig === undefined) delete process.env.BUDDY_CONFIG
      else process.env.BUDDY_CONFIG = previousConfig

      if (previousContent === undefined) delete process.env.BUDDY_CONFIG_CONTENT
      else process.env.BUDDY_CONFIG_CONTENT = previousContent

      if (previousGlobal === undefined) {
        fs.rmSync(globalFile, { force: true })
      } else {
        writeFileSync(globalFile, previousGlobal)
      }

      await Config.updateGlobal({})
    }
  })
})
