import { describe, expect, test } from "bun:test"
import z from "zod"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { ToolRegistry } from "@buddy/opencode-adapter/registry"
import { createBuddyTool } from "../../src/learning/tools/create-buddy-tool"
import { registerBuddyTools } from "../../src/learning/tools/register-buddy-tools"
import { tmpdir } from "../helpers/tmpdir"
import { requireTool } from "../helpers/tools"

const slowAbortTool = createBuddyTool("slow_abort_test", {
  description: "Slow tool used to verify abort propagation.",
  parameters: z.object({
    value: z.string(),
  }),
  async execute(args) {
    await Bun.sleep(250)
    return {
      title: "slow",
      output: args.value,
      metadata: {},
    }
  },
})

describe("buddy tool abort handling", () => {
  test("rejects promptly when the tool context aborts", async () => {
    await using project = await tmpdir({ git: true })

    const startedAt = Date.now()
    const execution = OpenCodeInstance.provide({
      directory: project.path,
      async fn() {
        await registerBuddyTools(project.path, [slowAbortTool])

        const tools = await ToolRegistry.tools({
          providerID: "opencode",
          modelID: "claude-sonnet",
        })
        const slowTool = requireTool(tools, "slow_abort_test")
        const abortController = new AbortController()
        setTimeout(() => abortController.abort(), 25)

        return slowTool.execute(
          { value: "late result" },
          {
            sessionID: "ses_abort",
            messageID: "msg_abort",
            agent: "math-buddy",
            abort: abortController.signal,
            messages: [],
            metadata() {},
            async ask() {},
          },
        )
      },
    })

    await expect(execution).rejects.toMatchObject({
      name: "AbortError",
    })
    expect(Date.now() - startedAt).toBeLessThan(150)
  })
})
