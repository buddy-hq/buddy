import { describe, expect, test } from "bun:test"
import path from "node:path"
import fs from "node:fs"
import { writeFileSync } from "node:fs"
import { Config } from "@buddy/backend/config"
import { Global } from "../../src/storage"
import { writeProjectConfig } from "../helpers/project-config"
import { createGitRepo } from "../helpers/repo"
import { resetGlobalConfigCache } from "../../src/config/store/global-cache"
import { resolveGlobalConfigFile } from "../../src/config/store/config-paths"
import { buildNotebookRuntimePlan } from "../../src/config/runtime/notebook-runtime-plan"

describe("config precedence", () => {
  test.each(["missing", "corrupt"])("a %s global secret survives a notebook enable override and can be re-entered", async (storeState) => {
    await using repository = await createGitRepo("buddy-missing-global-secret-override")
    const globalFile = resolveGlobalConfigFile()
    const storeFile = path.join(Global.Path.data, "secrets.json")
    const previousGlobal = fs.existsSync(globalFile) ? fs.readFileSync(globalFile, "utf8") : undefined
    const previousStore = fs.existsSync(storeFile) ? fs.readFileSync(storeFile, "utf8") : undefined
    try {
      fs.mkdirSync(path.dirname(globalFile), { recursive: true })
      writeFileSync(globalFile, JSON.stringify({ mcp: { shared: {
        type: "remote", url: "https://example.test/shared", enabled: false,
        headers: { Authorization: "{secret:sec_other_computer}" },
      } } }))
      if (storeState === "corrupt") writeFileSync(storeFile, '{"version":1,"secrets":broken')
      else fs.rmSync(storeFile, { force: true })
      resetGlobalConfigCache()
      writeProjectConfig(repository.path, JSON.stringify({ mcp: {
        shared: { enabled: true },
        ready: { type: "remote", url: "https://example.test/ready", oauth: false },
      } }))

      const config = await Config.getProject(repository.path)
      const plan = await buildNotebookRuntimePlan({ config, directory: repository.path })
      expect(plan.mcp.map((server) => server.name)).toEqual(["ready"])
      expect(JSON.stringify(plan)).not.toContain("{secret:")
      expect(config.mcp?.shared).toMatchObject({ type: "remote", enabled: true, headers: { Authorization: "{secret:sec_other_computer}" } })

      await Config.setProjectMcp(repository.path, "shared", {
        type: "remote", url: "https://example.test/shared", enabled: true,
        headers: { Authorization: "reentered-credential" },
      })
      const repaired = await buildNotebookRuntimePlan({ config: await Config.getProject(repository.path), directory: repository.path })
      expect(repaired.mcp.map((server) => server.name)).toEqual(["shared", "ready"])
      expect(repaired.mcp.find((server) => server.name === "shared")).toMatchObject({ disabled: false, headers: { Authorization: "reentered-credential" } })
      expect(JSON.stringify(repaired)).not.toContain("{secret:")
    } finally {
      if (previousGlobal === undefined) fs.rmSync(globalFile, { force: true })
      else writeFileSync(globalFile, previousGlobal)
      if (previousStore === undefined) fs.rmSync(storeFile, { force: true })
      else writeFileSync(storeFile, previousStore)
      resetGlobalConfigCache()
    }
  })

  test("applies precedence from global -> env file -> project root -> inline content", async () => {
    await using repository = await createGitRepo("buddy-config-precedence")
    const nested = path.join(repository.path, "nested")
    fs.mkdirSync(nested, { recursive: true })

    const customPath = path.join(repository.path, "custom.jsonc")
    writeFileSync(customPath, '{"model":"anthropic/custom"}\n')

    writeProjectConfig(repository.path, '{"model":"anthropic/project"}\n')
    writeProjectConfig(nested, '{"model":"anthropic/nested"}\n')

    const globalFile = path.join(Global.Path.config, "buddy.jsonc")
    fs.mkdirSync(path.dirname(globalFile), { recursive: true })
    const previousGlobal = fs.existsSync(globalFile)
      ? fs.readFileSync(globalFile, "utf8")
      : undefined

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
