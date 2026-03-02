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
    writeFileSync(customPath, '{"username":"custom-user","compaction":{"reserved":222}}\n')

    writeFileSync(path.join(repo, "buddy.jsonc"), '{"username":"project-user","compaction":{"reserved":333}}\n')
    writeFileSync(path.join(nested, "buddy.jsonc"), '{"username":"nested-user","compaction":{"reserved":444}}\n')
    fs.mkdirSync(path.join(repo, ".buddy"), { recursive: true })
    writeFileSync(path.join(repo, ".buddy", "buddy.jsonc"), '{"username":"overlay-user","compaction":{"reserved":666}}\n')

    const globalFile = path.join(Global.Path.config, "buddy.jsonc")
    fs.mkdirSync(path.dirname(globalFile), { recursive: true })
    const previousGlobal = fs.existsSync(globalFile) ? fs.readFileSync(globalFile, "utf8") : undefined

    const previousConfig = process.env.BUDDY_CONFIG
    const previousContent = process.env.BUDDY_CONFIG_CONTENT

    try {
      writeFileSync(globalFile, '{"username":"global-user","compaction":{"reserved":111}}\n')
      process.env.BUDDY_CONFIG = customPath
      process.env.BUDDY_CONFIG_CONTENT = '{"username":"inline-user","compaction":{"reserved":555}}'

      const cfg = await Config.getProject(nested)

      expect(cfg.username).toBe("inline-user")
      expect(cfg.compaction?.reserved).toBe(555)

      delete process.env.BUDDY_CONFIG_CONTENT

      const withoutInline = await Config.getProject(nested)

      expect(withoutInline.username).toBe("project-user")
      expect(withoutInline.compaction?.reserved).toBe(333)
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
