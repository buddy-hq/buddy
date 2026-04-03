import { describe, expect, test } from "bun:test"
import path from "node:path"
import { writeFileSync } from "node:fs"
import { Agent as OpenCodeAgent } from "@buddy/opencode-adapter/agent"
import { PermissionNext } from "@buddy/opencode-adapter/permission"
import { withSyncedOpenCodeConfig } from "../helpers/opencode"
import { createGitRepo } from "../helpers/repo"

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
  })
})
