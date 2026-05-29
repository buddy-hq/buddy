import { describe, expect, test } from "bun:test"
import { writeFileSync } from "node:fs"
import path from "node:path"
import type { ToolContext } from "@opencode-ai/plugin"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { ToolRegistry } from "@buddy/opencode-adapter/registry"
import type { MessageV2 } from "@buddy/opencode-adapter/message"
import { MessageID, ModelID, ProviderID, SessionID } from "@buddy/opencode-adapter/id"
import { Effect } from "effect"
import { ingestFullTextTool } from "../../src/learning/features/reading/tools/ingest-full-text"
import { createCompatiblePluginAskHandler } from "../../src/opencode-runtime/plugin-ask-compat"
import { buddyToolToPluginTool } from "../../src/opencode-runtime/buddy-tool-shim"
import { tmpdir } from "../helpers/tmpdir"
import { ensureBuddyPluginTools, requireTool, TEST_TOOL_MODEL } from "../helpers/tools"

type ActiveProviderModel = {
  providerID: string
  id: string
  limit: {
    context: number
    input: number
    output: number
  }
}

const TEST_ACTIVE_MODEL: ActiveProviderModel = {
  providerID: ProviderID.opencode,
  id: "test-model",
  limit: {
    context: 200_000,
    input: 200_000,
    output: 8_192,
  },
}

const LARGE_TEST_ACTIVE_MODEL: ActiveProviderModel = {
  providerID: ProviderID.opencode,
  id: "test-large-model",
  limit: {
    context: 1_000_000,
    input: 1_000_000,
    output: 8_192,
  },
}

function createUserMessageHistory(sessionID: string): MessageV2.WithParts[] {
  return [
    {
      info: {
        id: MessageID.make("msg_user"),
        sessionID: SessionID.make(sessionID),
        role: "user",
        time: { created: Date.now() },
        agent: "buddy",
        model: {
          providerID: ProviderID.opencode,
          modelID: ModelID.make("claude-sonnet"),
        },
      },
      parts: [],
    },
  ]
}

function createPluginExecuteContext(input: {
  directory: string
  sessionID: string
  messages: MessageV2.WithParts[]
  model: ActiveProviderModel
}): ToolContext & {
  messages: MessageV2.WithParts[]
  extra: { model: ActiveProviderModel }
} {
  return {
    sessionID: input.sessionID,
    messageID: "msg_test",
    agent: "buddy",
    directory: input.directory,
    worktree: input.directory,
    abort: new AbortController().signal,
    metadata() {},
    ask: createCompatiblePluginAskHandler(),
    messages: input.messages,
    extra: { model: input.model },
  }
}

function createRegistryToolContext(input: {
  directory: string
  sessionID: string
  messages: MessageV2.WithParts[]
  model: ActiveProviderModel
}) {
  return {
    sessionID: SessionID.make(input.sessionID),
    messageID: MessageID.make("msg_registry_tool"),
    agent: "buddy",
    abort: new AbortController().signal,
    messages: input.messages,
    extra: { model: input.model },
    metadata() {
      return Effect.void
    },
    ask() {
      return Effect.void
    },
  }
}

describe("ingest_full_text via plugin shim", () => {
  test("ingests a ready resource when session history includes the active model", async () => {
    await using project = await tmpdir({ git: true })
    await ensureBuddyPluginTools(project.path)

    const sourcePath = path.join(project.path, "frames.md")
    writeFileSync(
      sourcePath,
      "# Frames\n\nShort prepared text for ingestion regression coverage.\n",
      "utf8",
    )

    const sessionID = "ses_ingest_full_text"
    const messages = createUserMessageHistory(sessionID)

    await OpenCodeInstance.provide({
      directory: project.path,
      async fn() {
        const pluginContext = {
          directory: project.path,
          sessionID,
          messages,
          model: TEST_ACTIVE_MODEL,
        }

        const preparePlugin = buddyToolToPluginTool(
          (await import("../../src/learning/features/reading/tools/prepare-resource"))
            .prepareResourceTool,
          project.path,
        )
        const prepareResult = await preparePlugin.execute(
          {
            sourcePath,
            alias: "frames-md",
            waitUntilReady: true,
            maxWaitMs: 20_000,
          },
          createPluginExecuteContext(pluginContext),
        )

        expect(typeof prepareResult).toBe("object")
        if (typeof prepareResult === "string") {
          throw new Error("Expected prepare_resource object result")
        }
        expect(prepareResult.output).toContain("status=ready")

        const ingestPlugin = buddyToolToPluginTool(ingestFullTextTool, project.path)
        const ingestResult = await ingestPlugin.execute(
          { resource: "frames-md" },
          createPluginExecuteContext(pluginContext),
        )

        expect(typeof ingestResult).toBe("object")
        if (typeof ingestResult === "string") {
          throw new Error("Expected ingest_full_text object result")
        }
        expect(ingestResult.output).toContain("<resource_full_text_ingestion")
        expect(ingestResult.output).toContain('resource="frames-md"')
        expect(ingestResult.output).toContain("<full_text>")
        expect(ingestResult.output).not.toContain(
          "Could not resolve the active model for full-text ingestion.",
        )
      },
    })
  })

  test("repairs vendor plugin truncation only for ingest_full_text via its tool output policy", async () => {
    await using project = await tmpdir({ git: true })
    await ensureBuddyPluginTools(project.path)

    const repeatedLine =
      "alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron\n"
    const sourcePath = path.join(project.path, "large-frames.md")
    writeFileSync(sourcePath, "# Large Frames\n\n" + repeatedLine.repeat(1_200), "utf8")

    const sessionID = "ses_ingest_full_text_large_policy"
    const messages = createUserMessageHistory(sessionID)

    await OpenCodeInstance.provide({
      directory: project.path,
      async fn() {
        const tools = await ToolRegistry.tools(TEST_TOOL_MODEL)
        const prepareTool = requireTool(tools, "prepare_resource")
        const ingestTool = requireTool(tools, "ingest_full_text")
        const ctx = createRegistryToolContext({
          directory: project.path,
          sessionID,
          messages,
          model: LARGE_TEST_ACTIVE_MODEL,
        })

        const prepareResult = await prepareTool.execute(
          {
            sourcePath,
            alias: "large-frames-md",
            waitUntilReady: true,
            maxWaitMs: 20_000,
          },
          ctx,
        )
        expect(prepareResult.output).toContain("status=ready")

        const ingestResult = await ingestTool.execute({ resource: "large-frames-md" }, ctx)
        expect(ingestResult.metadata.truncated).toBe(false)
        expect("outputPath" in ingestResult.metadata).toBe(false)
        expect(ingestResult.output).toContain("<resource_full_text_ingestion")
        expect(ingestResult.output).toContain("<full_text>")
        expect(ingestResult.output).toContain(repeatedLine.trim())
        expect(ingestResult.output).not.toContain(
          "The tool call succeeded but the output was truncated.",
        )
      },
    })
  }, 30_000)
})
