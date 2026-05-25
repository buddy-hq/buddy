import { describe, expect, test } from "bun:test"
import path from "node:path"
import { writeFileSync } from "node:fs"
import { Agent as OpenCodeAgent } from "@buddy/opencode-adapter/agent"
import { Config as OpenCodeConfig } from "@buddy/opencode-adapter/config"
import { Global } from "@buddy/opencode-adapter/global"
import { PermissionNext } from "@buddy/opencode-adapter/permission"
import { Truncate } from "@buddy/opencode-adapter/tool"
import { withSyncedOpenCodeConfig } from "../helpers/opencode"
import { createGitRepo } from "../helpers/repo"
import { managedSystemRoot } from "../../src/learning/skill-management/service/paths"

const EXTERNAL_DIRECTORY_PERMISSION = "external_directory"
const ALLOW_ACTION = "allow"
const ASK_ACTION = "ask"

describe("config external_directory permission", () => {
  test("forces external directory access to ask even when project config sets allow", async () => {
    const repo = createGitRepo("buddy-config-external-directory-ask")

    writeFileSync(
      path.join(repo, "buddy.jsonc"),
      JSON.stringify(
        {
          permission: {
            external_directory: ALLOW_ACTION,
          },
        },
        null,
        2,
      ) + "\n",
    )

    const action = await withSyncedOpenCodeConfig(repo, async () => {
      const agent = await OpenCodeAgent.get("buddy")
      return PermissionNext.evaluate(
        EXTERNAL_DIRECTORY_PERMISSION,
        path.join(path.dirname(repo), "outside", "*"),
        agent.permission,
      ).action
    })

    expect(action).toBe(ASK_ACTION)
  }, 30_000)

  test("allows preloaded managed system skill paths without prompting", async () => {
    const repo = createGitRepo("buddy-config-external-directory-skills")

    const action = await withSyncedOpenCodeConfig(repo, async () => {
      const agent = await OpenCodeAgent.get("buddy")
      return PermissionNext.evaluate(
        EXTERNAL_DIRECTORY_PERMISSION,
        path.join(managedSystemRoot(), "sample-skill", "SKILL.md"),
        agent.permission,
      ).action
    })

    expect(action).toBe(ALLOW_ACTION)
  }, 30_000)

  test("allows vendor tmp and tool-output paths without prompting", async () => {
    const repo = createGitRepo("buddy-config-external-directory-vendor-paths")

    const result = await withSyncedOpenCodeConfig(repo, async () => {
      const agent = await OpenCodeAgent.get("buddy")
      return {
        tmp: PermissionNext.evaluate(
          EXTERNAL_DIRECTORY_PERMISSION,
          path.join(Global.Path.tmp, "scratch"),
          agent.permission,
        ).action,
        toolOutput: PermissionNext.evaluate(
          EXTERNAL_DIRECTORY_PERMISSION,
          Truncate.GLOB,
          agent.permission,
        ).action,
      }
    })

    expect(result.tmp).toBe(ALLOW_ACTION)
    expect(result.toolOutput).toBe(ALLOW_ACTION)
  })

  test("forwards compaction settings into the OpenCode runtime overlay", async () => {
    const repo = createGitRepo("buddy-config-compaction-overlay")

    writeFileSync(
      path.join(repo, "buddy.jsonc"),
      JSON.stringify(
        {
          compaction: {
            auto: false,
          },
        },
        null,
        2,
      ) + "\n",
    )

    const autoCompactionEnabled = await withSyncedOpenCodeConfig(repo, async () => {
      const runtimeConfig = await OpenCodeConfig.get()
      return runtimeConfig.compaction?.auto
    })

    expect(autoCompactionEnabled).toBe(false)
  })
})
