import { describe, expect, test } from "bun:test"
import { mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import type { ToolContext } from "@opencode-ai/plugin"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { ToolRegistry } from "@buddy/opencode-adapter/registry"
import type { MessageV2 } from "@buddy/opencode-adapter/message"
import { MessageID, ModelID, PartID, ProviderID, SessionID } from "@buddy/opencode-adapter/id"
import { Effect } from "effect"
import { ingestFullTextTool } from "../../src/learning/features/reading/tools/ingest-full-text"
import { createCompatiblePluginAskHandler } from "../../src/opencode-runtime/plugin-ask-compat"
import { buddyToolToPluginTool } from "../../src/opencode-runtime/buddy-tool-shim"
import { BUDDY_PROMPT_PART_METADATA_KEY } from "../../src/learning/prompt/workspace-file-references"
import { NATIVE_RESOURCE_ATTACHMENT_PART_TYPE } from "../../src/learning/prompt/native-resource-attachments"
import { estimateTokenCountFromText } from "../../src/resource-packs"
import { tmpdir } from "../helpers/tmpdir"
import { requireString, requireToolMetadata, requireToolObjectResult } from "../helpers/parse"
import { ensureBuddyPluginTools, requireTool, TEST_TOOL_MODEL } from "../helpers/tools"
import { createTextPdf } from "../helpers/pdf"
import { writeTeachingSessionState } from "../../src/learning/agent-execution/state/session-state"

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

const SMALL_TEST_ACTIVE_MODEL: ActiveProviderModel = {
  providerID: ProviderID.opencode,
  id: "test-small-model",
  limit: {
    context: 50_000,
    input: 50_000,
    output: 8_192,
  },
}

const FULL_TEXT_INPUT_WINDOW_CEILING_TOKENS = 250_000
const FULL_TEXT_INPUT_WINDOW_CEILING_RESERVE_TOKENS = 62_500
const MINIMUM_FULL_TEXT_RESERVE_TOKENS = 48_000
const INCIDENT_LIVE_USAGE_TOKENS = 21_490
const ONE_TOKEN_OVER_BUDGET = 1
const STALE_FULL_TEXT_ESTIMATE_TOKENS = 100
const CORRUPTED_GLYPH_REPEAT_COUNT = 200
const CORRUPTED_GLYPH_PATTERN = "ª¨±ø·Æ²­º¸¥´½³ß¹°©æÚÙµ™"
const EMPTY_SESSION_CAPPED_FULL_TEXT_LIMIT_TOKENS =
  FULL_TEXT_INPUT_WINDOW_CEILING_TOKENS - FULL_TEXT_INPUT_WINDOW_CEILING_RESERVE_TOKENS
const USED_SESSION_CAPPED_FULL_TEXT_LIMIT_TOKENS =
  EMPTY_SESSION_CAPPED_FULL_TEXT_LIMIT_TOKENS - INCIDENT_LIVE_USAGE_TOKENS

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

function createNativePdfMessageHistory(input: {
  sessionID: string
  sourcePath: string
  delivery: "model-and-resource" | "resource-only"
}): MessageV2.WithParts[] {
  const messages = createUserMessageHistory(input.sessionID)
  const message = messages[0]
  if (!message || message.info.role !== "user") {
    throw new Error("Expected user message history")
  }
  message.parts.push({
    id: PartID.make("prt_native_pdf_metadata"),
    sessionID: SessionID.make(input.sessionID),
    messageID: message.info.id,
    type: "text",
    text: "Attached native learning resource metadata",
    metadata: {
      [BUDDY_PROMPT_PART_METADATA_KEY]: {
        type: NATIVE_RESOURCE_ATTACHMENT_PART_TYPE,
        filename: "Native.pdf",
        sourcePath: input.sourcePath,
        format: "pdf",
        alias: "Native.pdf",
        mime: "application/pdf",
        delivery: input.delivery,
        pageCount: 1,
      },
    },
  })
  return messages
}

function createAssistantUsageMessage(
  sessionID: string,
  directory: string,
  totalTokens: number,
): MessageV2.WithParts {
  return {
    info: {
      id: MessageID.make("msg_assistant_usage"),
      sessionID: SessionID.make(sessionID),
      role: "assistant",
      time: { created: Date.now(), completed: Date.now() },
      parentID: MessageID.make("msg_user"),
      modelID: ModelID.make(LARGE_TEST_ACTIVE_MODEL.id),
      providerID: ProviderID.opencode,
      mode: "buddy",
      agent: "buddy",
      path: { cwd: directory, root: directory },
      cost: 0,
      tokens: {
        input: totalTokens,
        output: 0,
        reasoning: 0,
        cache: { read: 0, write: 0 },
        total: totalTokens,
      },
    },
    parts: [],
  }
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
    const sourceText = "# Frames\n\nShort prepared text for ingestion regression coverage.\n"
    writeFileSync(sourcePath, sourceText, "utf8")

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
        const parsed_prepareResult = requireToolObjectResult(prepareResult, "Expected prepare_resource object result")
        expect(parsed_prepareResult.output).toContain("status=ready")
        expect(parsed_prepareResult.output).toContain(
          `full_text_est_tokens=${estimateTokenCountFromText(sourceText.trim())}`,
        )

        const ingestPlugin = buddyToolToPluginTool(ingestFullTextTool, project.path)
        const ingestResult = await ingestPlugin.execute(
          { resourceKey: "frames-md" },
          createPluginExecuteContext(pluginContext),
        )
        const parsed_ingestResult = requireToolObjectResult(ingestResult, "Expected ingest_full_text object result")
        expect(parsed_ingestResult.output).toContain("<resource_full_text_ingestion")
        expect(parsed_ingestResult.output).toContain('resource="frames-md"')
        expect(parsed_ingestResult.output).toContain("<full_text>")
        expect(parsed_ingestResult.output).not.toContain(
          "Could not resolve the active model for full-text ingestion.",
        )

        writeTeachingSessionState(project.path, {
          sessionId: sessionID,
          persona: "buddy",
          currentSurface: "curriculum",
          teachingWorkspaceState: "inactive",
          conciseResponses: false,
          focusGoalIds: [],
        })
        const flexibleResult = await ingestPlugin.execute(
          { resourceKey: "frames-md" },
          createPluginExecuteContext(pluginContext),
        )
        const parsedFlexibleResult = requireToolObjectResult(
          flexibleResult,
          "Expected flexible ingest_full_text object result",
        )
        expect(parsedFlexibleResult.output).not.toBe(parsed_ingestResult.output)
        expect(parsedFlexibleResult.output.length).toBeLessThan(parsed_ingestResult.output.length)
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
        const parsed_prepareResult = requireToolObjectResult(
          prepareResult,
          "Expected prepare_resource object result",
        )
        expect(parsed_prepareResult.output).toContain("status=ready")

        const ingestResult = await ingestTool.execute({ resourceKey: "large-frames-md" }, ctx)
        const parsed_ingestResult = requireToolObjectResult(
          ingestResult,
          "Expected ingest_full_text object result",
        )
        expect(requireToolMetadata(parsed_ingestResult).truncated).toBe(false)
        expect(parsed_ingestResult.output).toContain("<resource_full_text_ingestion")
        expect(parsed_ingestResult.output).toContain("<full_text>")
        expect(parsed_ingestResult.output).toContain(repeatedLine.trim())
        expect(parsed_ingestResult.output).not.toContain(
          "The tool call succeeded but the output was truncated.",
        )
      },
    })
  }, 30_000)

  test("does not duplicate prepared full text for a natively delivered PDF", async () => {
    await using project = await tmpdir({ git: true })
    await ensureBuddyPluginTools(project.path)

    const uploadsDirectory = path.join(project.path, "uploads")
    const sourcePath = path.join(uploadsDirectory, "Native--abcdefghij.pdf")
    mkdirSync(uploadsDirectory, { recursive: true })
    writeFileSync(sourcePath, createTextPdf("Native PDF context guard"), "utf8")

    const sessionID = "ses_ingest_full_text_native_pdf"
    const nativeMessages = createNativePdfMessageHistory({
      sessionID,
      sourcePath,
      delivery: "model-and-resource",
    })

    await OpenCodeInstance.provide({
      directory: project.path,
      async fn() {
        const preparePlugin = buddyToolToPluginTool(
          (await import("../../src/learning/features/reading/tools/prepare-resource"))
            .prepareResourceTool,
          project.path,
        )
        const baseContext = {
          directory: project.path,
          sessionID,
          messages: nativeMessages,
          model: TEST_ACTIVE_MODEL,
        }
        const prepareResult = await preparePlugin.execute(
          {
            sourcePath,
            alias: "native-pdf",
            waitUntilReady: true,
            maxWaitMs: 20_000,
          },
          createPluginExecuteContext(baseContext),
        )
        const parsed_prepareResult = requireToolObjectResult(prepareResult, "Expected prepare_resource object result")
        expect(parsed_prepareResult.output).toContain("status=ready")

        const ingestPlugin = buddyToolToPluginTool(ingestFullTextTool, project.path)
        const nativeResult = await ingestPlugin.execute(
          { resourceKey: "native-pdf" },
          createPluginExecuteContext(baseContext),
        )
        const parsed_nativeResult = requireToolObjectResult(nativeResult, "Expected native PDF fallback result with metadata")
        const nativeMetadata = requireToolMetadata(parsed_nativeResult)
        expect(nativeMetadata.completed).toBe(false)
        expect(nativeMetadata.reason).toBe("native_pdf_already_in_context")
        expect(nativeMetadata.fallback).toBe("scoped_reading")
        expect(parsed_nativeResult.output).toContain("already present as native model input")
        expect(parsed_nativeResult.output).not.toContain("<full_text>")

        const resourceOnlyMessages = createNativePdfMessageHistory({
          sessionID,
          sourcePath,
          delivery: "resource-only",
        })
        const resourceOnlyResult = await ingestPlugin.execute(
          { resourceKey: "native-pdf" },
          createPluginExecuteContext({
            ...baseContext,
            messages: resourceOnlyMessages,
          }),
        )
        const parsed_resourceOnlyResult = requireToolObjectResult(resourceOnlyResult, "Expected resource-only ingestion object result with metadata")
        expect(requireToolMetadata(parsed_resourceOnlyResult).completed).toBe(true)
        expect(parsed_resourceOnlyResult.output).toContain("<full_text>")
      },
    })
  })

  test("caps the tool budget at 250k and subtracts live usage without changing model context", async () => {
    await using project = await tmpdir({ git: true })
    await ensureBuddyPluginTools(project.path)

    const sourcePath = path.join(project.path, "capped-window.md")
    writeFileSync(sourcePath, "# Capped Window\n\nBoundary test content.\n", "utf8")

    const sessionID = "ses_ingest_full_text_capped_window"
    const messages = createUserMessageHistory(sessionID)

    await OpenCodeInstance.provide({
      directory: project.path,
      async fn() {
        const pluginContext = {
          directory: project.path,
          sessionID,
          messages,
          model: LARGE_TEST_ACTIVE_MODEL,
        }
        const preparePlugin = buddyToolToPluginTool(
          (await import("../../src/learning/features/reading/tools/prepare-resource"))
            .prepareResourceTool,
          project.path,
        )
        const prepareResult = await preparePlugin.execute(
          {
            sourcePath,
            alias: "capped-window-md",
            waitUntilReady: true,
            maxWaitMs: 20_000,
          },
          createPluginExecuteContext(pluginContext),
        )
        const parsed_prepareResult = requireToolObjectResult(prepareResult, "Expected prepare_resource object result")
        const parsed_fullTextPath = requireString(
          requireToolMetadata(parsed_prepareResult).fullTextPath,
          "Expected prepare_resource full-text path",
        )

        const writeEstimatedTokenCount = (estimatedTokens: number) => {
          writeFileSync(
            path.resolve(project.path, parsed_fullTextPath),
            `---\nest_tokens: ${estimatedTokens}\n---\nBoundary test content.\n`,
            "utf8",
          )
        }
        const ingestPlugin = buddyToolToPluginTool(ingestFullTextTool, project.path)

        writeEstimatedTokenCount(EMPTY_SESSION_CAPPED_FULL_TEXT_LIMIT_TOKENS)
        const boundaryResult = await ingestPlugin.execute(
          { resourceKey: "capped-window-md" },
          createPluginExecuteContext(pluginContext),
        )
        const parsed_boundaryResult = requireToolObjectResult(boundaryResult, "Expected ingest_full_text object result with metadata")
        const boundaryMetadata = requireToolMetadata(parsed_boundaryResult)
        expect(boundaryMetadata.completed).toBe(true)
        expect(boundaryMetadata.inputWindow).toBe(FULL_TEXT_INPUT_WINDOW_CEILING_TOKENS)
        expect(boundaryMetadata.contextWindow).toBe(LARGE_TEST_ACTIVE_MODEL.limit.context)
        expect(boundaryMetadata.remainingAfterIngestion).toBe(
          FULL_TEXT_INPUT_WINDOW_CEILING_RESERVE_TOKENS,
        )

        writeEstimatedTokenCount(
          EMPTY_SESSION_CAPPED_FULL_TEXT_LIMIT_TOKENS + ONE_TOKEN_OVER_BUDGET,
        )
        const overBoundaryResult = await ingestPlugin.execute(
          { resourceKey: "capped-window-md" },
          createPluginExecuteContext(pluginContext),
        )
        const parsed_overBoundaryResult = requireToolObjectResult(overBoundaryResult, "Expected ingest_full_text fallback result with metadata")
        const overBoundaryMetadata = requireToolMetadata(parsed_overBoundaryResult)
        expect(overBoundaryMetadata.completed).toBe(false)
        expect(overBoundaryMetadata.reason).toBe("context_too_full")
        expect(overBoundaryMetadata.fallback).toBe("scoped_reading")
        expect(overBoundaryMetadata.requiredReserveAfterIngestion).toBe(
          FULL_TEXT_INPUT_WINDOW_CEILING_RESERVE_TOKENS,
        )
        expect(parsed_overBoundaryResult.output).not.toContain("<full_text>")

        const messagesWithUsage = [
          ...messages,
          createAssistantUsageMessage(sessionID, project.path, INCIDENT_LIVE_USAGE_TOKENS),
        ]
        const usedPluginContext = {
          ...pluginContext,
          messages: messagesWithUsage,
        }

        writeEstimatedTokenCount(USED_SESSION_CAPPED_FULL_TEXT_LIMIT_TOKENS)
        const usedBoundaryResult = await ingestPlugin.execute(
          { resourceKey: "capped-window-md" },
          createPluginExecuteContext(usedPluginContext),
        )
        const parsed_usedBoundaryResult = requireToolObjectResult(usedBoundaryResult, "Expected used-session ingest result with metadata")
        const usedBoundaryMetadata = requireToolMetadata(parsed_usedBoundaryResult)
        expect(usedBoundaryMetadata.completed).toBe(true)
        expect(usedBoundaryMetadata.liveUsageEstimate).toBe(INCIDENT_LIVE_USAGE_TOKENS)
        expect(usedBoundaryMetadata.remainingAfterIngestion).toBe(
          FULL_TEXT_INPUT_WINDOW_CEILING_RESERVE_TOKENS,
        )

        writeEstimatedTokenCount(USED_SESSION_CAPPED_FULL_TEXT_LIMIT_TOKENS + ONE_TOKEN_OVER_BUDGET)
        const usedOverBoundaryResult = await ingestPlugin.execute(
          { resourceKey: "capped-window-md" },
          createPluginExecuteContext(usedPluginContext),
        )
        const parsed_usedOverBoundaryResult = requireToolObjectResult(usedOverBoundaryResult, "Expected used-session fallback result with metadata")
        const usedOverBoundaryMetadata = requireToolMetadata(parsed_usedOverBoundaryResult)
        expect(usedOverBoundaryMetadata.completed).toBe(false)
        expect(usedOverBoundaryMetadata.remainingAfterIngestion).toBe(
          FULL_TEXT_INPUT_WINDOW_CEILING_RESERVE_TOKENS - ONE_TOKEN_OVER_BUDGET,
        )
      },
    })
  })

  test("returns scoped-reading fallback instead of throwing when full text lacks headroom", async () => {
    await using project = await tmpdir({ git: true })
    await ensureBuddyPluginTools(project.path)

    const sourcePath = path.join(project.path, "small-window.md")
    const reservePressureLine =
      "alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron\n"
    writeFileSync(
      sourcePath,
      "# Small Window\n\n" +
        "A prepared text large enough to leave less than the post-ingest reserve on a small model.\n\n" +
        reservePressureLine.repeat(300),
      "utf8",
    )

    const sessionID = "ses_ingest_full_text_small_window"
    const messages = createUserMessageHistory(sessionID)

    await OpenCodeInstance.provide({
      directory: project.path,
      async fn() {
        const preparePlugin = buddyToolToPluginTool(
          (await import("../../src/learning/features/reading/tools/prepare-resource"))
            .prepareResourceTool,
          project.path,
        )
        const prepareResult = await preparePlugin.execute(
          {
            sourcePath,
            alias: "small-window-md",
            waitUntilReady: true,
            maxWaitMs: 20_000,
          },
          createPluginExecuteContext({
            directory: project.path,
            sessionID,
            messages,
            model: SMALL_TEST_ACTIVE_MODEL,
          }),
        )
        const parsed_prepareResult = requireToolObjectResult(prepareResult, "Expected prepare_resource object result")
        expect(parsed_prepareResult.output).toContain("status=ready")

        const ingestPlugin = buddyToolToPluginTool(ingestFullTextTool, project.path)
        const ingestResult = await ingestPlugin.execute(
          { resourceKey: "small-window-md" },
          createPluginExecuteContext({
            directory: project.path,
            sessionID,
            messages,
            model: SMALL_TEST_ACTIVE_MODEL,
          }),
        )
        const parsed_ingestResult = requireToolObjectResult(ingestResult, "Expected ingest_full_text object result")
        const ingestMetadata = requireToolMetadata(parsed_ingestResult)
        expect(ingestMetadata.completed).toBe(false)
        expect(ingestMetadata.reason).toBe("context_too_full")
        expect(ingestMetadata.fallback).toBe("scoped_reading")
        expect(ingestMetadata.inputWindow).toBe(SMALL_TEST_ACTIVE_MODEL.limit.input)
        expect(ingestMetadata.contextWindow).toBe(SMALL_TEST_ACTIVE_MODEL.limit.context)
        expect(ingestMetadata.requiredReserveAfterIngestion).toBe(MINIMUM_FULL_TEXT_RESERVE_TOKENS)
        expect(parsed_ingestResult.output).toContain('completed="false"')
        expect(parsed_ingestResult.output).toContain("Continue with scoped reading")
        expect(parsed_ingestResult.output).not.toContain("<full_text>")
      },
    })
  })

  test("recalculates stale pack estimates before full-text admission", async () => {
    await using project = await tmpdir({ git: true })
    await ensureBuddyPluginTools(project.path)

    const sourcePath = path.join(project.path, "legacy-estimate.md")
    writeFileSync(sourcePath, "# Legacy Estimate\n\nShort placeholder.\n", "utf8")

    const sessionID = "ses_ingest_full_text_stale_estimate"
    const messages = createUserMessageHistory(sessionID)
    const pluginContext = {
      directory: project.path,
      sessionID,
      messages,
      model: SMALL_TEST_ACTIVE_MODEL,
    }

    await OpenCodeInstance.provide({
      directory: project.path,
      async fn() {
        const preparePlugin = buddyToolToPluginTool(
          (await import("../../src/learning/features/reading/tools/prepare-resource"))
            .prepareResourceTool,
          project.path,
        )
        const prepareResult = await preparePlugin.execute(
          {
            sourcePath,
            alias: "legacy-estimate-md",
            waitUntilReady: true,
            maxWaitMs: 20_000,
          },
          createPluginExecuteContext(pluginContext),
        )
        const parsed_prepareResult = requireToolObjectResult(prepareResult, "Expected prepare_resource object result")
        const parsed_fullTextPath = requireString(
          requireToolMetadata(parsed_prepareResult).fullTextPath,
          "Expected prepare_resource full-text path",
        )

        const corruptedFullText = CORRUPTED_GLYPH_PATTERN.repeat(CORRUPTED_GLYPH_REPEAT_COUNT)
        const recalculatedTokens = estimateTokenCountFromText(corruptedFullText)
        expect(recalculatedTokens).toBeGreaterThan(STALE_FULL_TEXT_ESTIMATE_TOKENS)
        writeFileSync(
          path.resolve(project.path, parsed_fullTextPath),
          `---\nest_tokens: ${STALE_FULL_TEXT_ESTIMATE_TOKENS}\n---\n${corruptedFullText}\n`,
          "utf8",
        )

        const ingestPlugin = buddyToolToPluginTool(ingestFullTextTool, project.path)
        const ingestResult = await ingestPlugin.execute(
          { resourceKey: "legacy-estimate-md" },
          createPluginExecuteContext(pluginContext),
        )
        const parsed_ingestResult = requireToolObjectResult(ingestResult, "Expected stale-estimate fallback result with metadata")
        const ingestMetadata = requireToolMetadata(parsed_ingestResult)
        expect(ingestMetadata.completed).toBe(false)
        expect(ingestMetadata.reason).toBe("context_too_full")
        expect(ingestMetadata.fallback).toBe("scoped_reading")
        expect(ingestMetadata.fullTextEstimatedTokens).toBe(recalculatedTokens)
        expect(parsed_ingestResult.output).not.toContain("<full_text>")
      },
    })
  })
})
