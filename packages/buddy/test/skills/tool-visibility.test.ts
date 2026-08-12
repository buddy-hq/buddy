import { describe, expect, test } from "bun:test"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { ToolRegistry } from "@buddy/opencode-adapter/registry"
import { syncOpenCodeProjectConfig } from "@buddy/backend/config/runtime"
import { tmpdir } from "../helpers/tmpdir"
import { createToolContext, requireTool, TEST_TOOL_MODEL } from "../helpers/tools"

describe("skill tool visibility", () => {
  test("vendor skill tool exposes Buddy teaching skills through agent permissions", async () => {
    try {
      await using project = await tmpdir({ git: true })

      const output = await OpenCodeInstance.provide({
        directory: project.path,
        async fn() {
          await syncOpenCodeProjectConfig(project.path, true)

          const tools = await ToolRegistry.tools(TEST_TOOL_MODEL, "buddy")
          const skillTool = requireTool(tools, "skill")
          const loaded = await skillTool.execute(
            {
              name: "teaching-models",
            },
            createToolContext({
              sessionID: "ses_skill",
              messageID: "msg_skill",
              agent: "buddy",
            }),
          )

          return loaded.output
        },
      })

      expect(output).toContain("teaching-models")
    } finally {
      await OpenCodeInstance.disposeAll()
    }
  }, 15_000)
})
