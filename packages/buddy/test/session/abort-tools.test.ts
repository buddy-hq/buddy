import { describe, expect, test } from "bun:test"
import type { ToolCallOptions } from "ai"
import z from "zod"
import { Agent } from "@buddy/opencode-adapter/agent"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { type MessageV2 } from "@buddy/opencode-adapter/message"
import { Provider } from "@buddy/opencode-adapter/provider"
import { ToolRegistry } from "@buddy/opencode-adapter/registry"
import { Session } from "@buddy/opencode-adapter/session"
import { SessionPrompt } from "@buddy/opencode-adapter/session-prompt"
import { tmpdir } from "../helpers/tmpdir"

describe("session abort while tools are running", () => {
  test("stops waiting for a tool result as soon as the session aborts", async () => {
    await using project = await tmpdir({ git: true })

    await OpenCodeInstance.provide({
      directory: project.path,
      async fn() {
        await ToolRegistry.register({
          id: "slow_abort_test",
          init: async () => ({
            description: "Slow tool used to verify abort propagation.",
            parameters: z.object({
              value: z.string(),
            }),
            async execute(input) {
              const args = z
                .object({
                  value: z.string(),
                })
                .parse(input)
              await Bun.sleep(250)
              return {
                title: "slow",
                output: args.value,
                metadata: {},
              }
            },
          }),
        })

        const session = await Session.create({})
        const agent = await Agent.get("build")
        const model = Provider.Model.parse({
          id: "gpt-5.2",
          providerID: "openai",
          api: {
            id: "openai",
            url: "https://api.openai.com/v1",
            npm: "@ai-sdk/openai",
          },
          name: "GPT-5.2",
          capabilities: {
            temperature: true,
            reasoning: true,
            attachment: true,
            toolcall: true,
            input: {
              text: true,
              audio: false,
              image: true,
              video: false,
              pdf: true,
            },
            output: {
              text: true,
              audio: false,
              image: false,
              video: false,
              pdf: false,
            },
            interleaved: false,
          },
          cost: {
            input: 0,
            output: 0,
            cache: {
              read: 0,
              write: 0,
            },
          },
          limit: {
            context: 128_000,
            output: 8_000,
          },
          status: "active",
          options: {},
          headers: {},
          release_date: "2026-01-01",
        })
        const processor: {
          message: Pick<MessageV2.Assistant, "id">
          partFromToolCall(toolCallID: string): undefined
        } = {
          message: {
            id: "msg_abort_tools",
          },
          partFromToolCall() {
            return undefined
          },
        }

        const tools = await SessionPrompt.resolveTools({
          agent,
          session: await Session.get(session.id),
          model,
          processor,
          bypassAgentCheck: true,
          messages: [],
        })

        const slowTool = tools.slow_abort_test
        expect(slowTool).toBeDefined()
        if (!slowTool || typeof slowTool.execute !== "function") {
          throw new Error("Expected slow_abort_test to expose execute")
        }

        const abortController = new AbortController()
        const options: ToolCallOptions = {
          toolCallId: "call_slow_abort_test",
          abortSignal: abortController.signal,
          messages: [],
        }

        const startedAt = Date.now()
        const execution = slowTool.execute({ value: "late result" }, options)
        setTimeout(() => abortController.abort(), 25)

        await expect(execution).rejects.toMatchObject({
          name: "AbortError",
        })
        expect(Date.now() - startedAt).toBeLessThan(150)

        await Session.remove(session.id)
      },
    })
  })
})
