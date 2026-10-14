import { afterAll, describe, expect, test } from "bun:test"
import { mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import { Config } from "@buddy/backend/config"
import type { MessageWithParts } from "@buddy/transcript-contract/message"
import type { BuddyToolContext } from "../../src/learning/runtime/create-buddy-tool"
import { getOpenCodeClient } from "../../src/opencode-runtime/client"
import { closeOpenCodeHost } from "../../src/opencode-runtime/runtime"
import { syncOpenCodeProjectConfig } from "../../src/config/runtime/opencode-sync"
import { writeProjectConfig } from "../helpers/project-config"
import { scriptedToolModel } from "../helpers/scripted-tool-model"
import { BUDDY_PROMPT_PART_METADATA_KEY, NATIVE_RESOURCE_ATTACHMENT_PART_TYPE } from "../../src/learning/prompt/native-resource-metadata"
import { estimateTokenCountFromText } from "../../src/resource-packs"
import { tmpdir } from "../helpers/tmpdir"
import { requireString, requireToolMetadata, requireToolObjectResult } from "../helpers/parse"
import { createBuddyToolContext } from "../helpers/tools"
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
  providerID: "scripted",
  id: "test-model",
  limit: {
    context: 200_000,
    input: 200_000,
    output: 8_192,
  },
}

const LARGE_TEST_ACTIVE_MODEL: ActiveProviderModel = {
  providerID: "scripted",
  id: "test-large-model",
  limit: {
    context: 1_000_000,
    input: 1_000_000,
    output: 8_192,
  },
}

const SMALL_TEST_ACTIVE_MODEL: ActiveProviderModel = {
  providerID: "scripted",
  id: "test-small-model",
  limit: {
    context: 50_000,
    input: 50_000,
    output: 8_192,
  },
}

const { ingestFullTextTool } = await import("../../src/learning/features/reading/tools/ingest-full-text")
const { prepareResourceTool } = await import("../../src/learning/features/reading/tools/prepare-resource")

afterAll(closeOpenCodeHost)

async function configureModels(directory: string) {
  writeProjectConfig(directory, JSON.stringify({
    model: "scripted/test-model",
    provider: { scripted: { npm: "@ai-sdk/perplexity", options: { apiKey: "test" }, models: Object.fromEntries(
      [TEST_ACTIVE_MODEL, LARGE_TEST_ACTIVE_MODEL, SMALL_TEST_ACTIVE_MODEL].map((model) => [model.id, { limit: model.limit }]),
    ) } },
  }))
  await syncOpenCodeProjectConfig(directory)
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

function createUserMessageHistory(sessionID: string): MessageWithParts[] {
  return [
    {
      info: {
        id: "msg_user",
        sessionID: sessionID,
        role: "user",
        time: { created: Date.now() },
        agent: "buddy",
        model: {
          providerID: "scripted",
          modelID: "claude-sonnet",
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
}): MessageWithParts[] {
  const messages = createUserMessageHistory(input.sessionID)
  const message = messages[0]
  if (!message || message.info.role !== "user") {
    throw new Error("Expected user message history")
  }
  return [{
    ...message,
    parts: [...message.parts, {
      id: "prt_native_pdf_metadata",
      sessionID: input.sessionID,
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
    }],
  }]
}

function createAssistantUsageMessage(
  sessionID: string,
  directory: string,
  totalTokens: number,
): MessageWithParts {
  return {
    info: {
      id: "msg_assistant_usage",
      sessionID: sessionID,
      role: "assistant",
      time: { created: Date.now(), completed: Date.now() },
      parentID: "msg_user",
      modelID: LARGE_TEST_ACTIVE_MODEL.id,
      providerID: "scripted",
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

function createExecutionContext(input: {
  directory: string
  sessionID: string
  messages: MessageWithParts[]
  model: ActiveProviderModel
}): BuddyToolContext {
  return {
    ...createBuddyToolContext({
    directory: input.directory, sessionID: input.sessionID, agent: "buddy" }),
    messages: input.messages.map((message) => message.info.role === "user" ? {
      ...message, info: { ...message.info, model: { providerID: input.model.providerID, modelID: input.model.id } },
    } : message),
  }
}

describe("ingest_full_text on v2", () => {
  test("ingests a ready resource when session history includes the active model", async () => {
    await using project = await tmpdir({ git: true })
    await configureModels(project.path)

    const sourcePath = path.join(project.path, "frames.md")
    const sourceText = "# Frames\n\nShort prepared text for ingestion regression coverage.\n"
    writeFileSync(sourcePath, sourceText, "utf8")

    const sessionID = "ses_ingest_full_text"
    const messages = createUserMessageHistory(sessionID)

    const contextInput = {
      directory: project.path,
      sessionID,
      messages,
      model: TEST_ACTIVE_MODEL,
    }
    const prepareResult = await prepareResourceTool.run(
      {
        sourcePath,
        alias: "frames-md",
        waitUntilReady: true,
        maxWaitMs: 20_000,
      },
      createExecutionContext(contextInput),
    )
    const parsed_prepareResult = requireToolObjectResult(
      prepareResult,
      "Expected prepare_resource object result",
    )
    expect(parsed_prepareResult.output).toContain("status=ready")
    expect(parsed_prepareResult.output).toContain(
      `full_text_est_tokens=${estimateTokenCountFromText(sourceText.trim())}`,
    )
    const ingestResult = await ingestFullTextTool.run(
      { resourceKey: "frames-md" },
      createExecutionContext(contextInput),
    )
    const parsed_ingestResult = requireToolObjectResult(
      ingestResult,
      "Expected ingest_full_text object result",
    )
    expect(parsed_ingestResult.output).toContain("<resource_full_text_ingestion")
    expect(parsed_ingestResult.output).toContain('resource="frames-md"')
    expect(parsed_ingestResult.output).toContain("<full_text>")
    expect(parsed_ingestResult.output).toContain("Long Response Caution")
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
    const flexibleResult = await ingestFullTextTool.run(
      { resourceKey: "frames-md" },
      createExecutionContext(contextInput),
    )
    const parsedFlexibleResult = requireToolObjectResult(
      flexibleResult,
      "Expected flexible ingest_full_text object result",
    )
    expect(parsedFlexibleResult.output).not.toBe(parsed_ingestResult.output)
    expect(parsedFlexibleResult.output.length).toBeLessThan(parsed_ingestResult.output.length)
    expect(parsedFlexibleResult.output).not.toContain("Long Response Caution")
    const previousGlobalConfig = await Config.getGlobal()
    try {
      await Config.replaceGlobal({
        ...previousGlobalConfig,
        concise_responses: false,
      })

      const configuredFlexibleSessionID = "ses_ingest_full_text_configured_flexible"
      const configuredFlexibleResult = await ingestFullTextTool.run(
        { resourceKey: "frames-md" },
        createExecutionContext({
          ...contextInput,
          sessionID: configuredFlexibleSessionID,
          messages: createUserMessageHistory(configuredFlexibleSessionID),
        }),
      )
      const parsedConfiguredFlexibleResult = requireToolObjectResult(
        configuredFlexibleResult,
        "Expected configured flexible ingest_full_text object result",
      )
      expect(parsedConfiguredFlexibleResult.output).not.toContain("Long Response Caution")
    } finally {
      await Config.replaceGlobal(previousGlobalConfig)
    }
  })

  test("keeps large full-text output intact through a real v2 tool turn", async () => {
    await using project = await tmpdir({ git: true })
    await configureModels(project.path)
    const repeatedLine = "alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron\n"
    const sourcePath = path.join(project.path, "large-frames.md")
    writeFileSync(sourcePath, "# Large Frames\n\n" + repeatedLine.repeat(1_200), "utf8")
    await prepareResourceTool.run(
      { sourcePath, alias: "large-frames-md", waitUntilReady: true },
      createBuddyToolContext({ directory: project.path, agent: "buddy" }),
    )
    const host = await getOpenCodeClient()
    await host.plugin(scriptedToolModel({ name: "ingest_full_text", arguments: { resourceKey: "large-frames-md" } }))
    const session = await host.session.create({ location: { directory: project.path }, agent: "buddy",
      model: { providerID: "scripted", id: LARGE_TEST_ACTIVE_MODEL.id },
      permissions: [{ action: "*", resource: "*", effect: "allow" }],
    })
    await host.session.prompt({ sessionID: session.id, text: "Ingest the prepared full text." })
    await host.session.wait({ sessionID: session.id })
    const history = await host.message.list({ sessionID: session.id })
    const tools = history.data.flatMap((message) => message.type === "assistant" ? message.content.filter((part) => part.type === "tool") : [])
    const result = tools.find((tool) => tool.name === "ingest_full_text")
    expect(result?.state.status).toBe("completed")
    if (result?.state.status !== "completed") throw new Error("Full-text tool did not complete: " + JSON.stringify(result?.state))
    const output = result.state.content.filter((part) => part.type === "text").map((part) => part.text).join("\n")
    expect(result.state.metadata).toMatchObject({ truncated: false })
    expect(output).toContain("<resource_full_text_ingestion")
    expect(output).toContain(repeatedLine.repeat(1_200).trim())
    expect(output).not.toContain("The tool call succeeded but the output was truncated.")
  })

  test("does not duplicate prepared full text for a natively delivered PDF", async () => {
    await using project = await tmpdir({ git: true })
    await configureModels(project.path)

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

    const baseContext = {
      directory: project.path,
      sessionID,
      messages: nativeMessages,
      model: TEST_ACTIVE_MODEL,
    }
    const prepareResult = await prepareResourceTool.run(
      {
        sourcePath,
        alias: "native-pdf",
        waitUntilReady: true,
        maxWaitMs: 20_000,
      },
      createExecutionContext(baseContext),
    )
    const parsed_prepareResult = requireToolObjectResult(
      prepareResult,
      "Expected prepare_resource object result",
    )
    expect(parsed_prepareResult.output).toContain("status=ready")
    const nativeResult = await ingestFullTextTool.run(
      { resourceKey: "native-pdf" },
      createExecutionContext(baseContext),
    )
    const parsed_nativeResult = requireToolObjectResult(
      nativeResult,
      "Expected native PDF fallback result with metadata",
    )
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
    const resourceOnlyResult = await ingestFullTextTool.run(
      { resourceKey: "native-pdf" },
      createExecutionContext({
        ...baseContext,
        messages: resourceOnlyMessages,
      }),
    )
    const parsed_resourceOnlyResult = requireToolObjectResult(
      resourceOnlyResult,
      "Expected resource-only ingestion object result with metadata",
    )
    expect(requireToolMetadata(parsed_resourceOnlyResult).completed).toBe(true)
    expect(parsed_resourceOnlyResult.output).toContain("<full_text>")
  })

  test("caps the tool budget at 250k and subtracts live usage without changing model context", async () => {
    await using project = await tmpdir({ git: true })
    await configureModels(project.path)

    const sourcePath = path.join(project.path, "capped-window.md")
    writeFileSync(sourcePath, "# Capped Window\n\nBoundary test content.\n", "utf8")

    const sessionID = "ses_ingest_full_text_capped_window"
    const messages = createUserMessageHistory(sessionID)

    const contextInput = {
      directory: project.path,
      sessionID,
      messages,
      model: LARGE_TEST_ACTIVE_MODEL,
    }
    const prepareResult = await prepareResourceTool.run(
      {
        sourcePath,
        alias: "capped-window-md",
        waitUntilReady: true,
        maxWaitMs: 20_000,
      },
      createExecutionContext(contextInput),
    )
    const parsed_prepareResult = requireToolObjectResult(
      prepareResult,
      "Expected prepare_resource object result",
    )
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
    writeEstimatedTokenCount(EMPTY_SESSION_CAPPED_FULL_TEXT_LIMIT_TOKENS)
    const boundaryResult = await ingestFullTextTool.run(
      { resourceKey: "capped-window-md" },
      createExecutionContext(contextInput),
    )
    const parsed_boundaryResult = requireToolObjectResult(
      boundaryResult,
      "Expected ingest_full_text object result with metadata",
    )
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
    const overBoundaryResult = await ingestFullTextTool.run(
      { resourceKey: "capped-window-md" },
      createExecutionContext(contextInput),
    )
    const parsed_overBoundaryResult = requireToolObjectResult(
      overBoundaryResult,
      "Expected ingest_full_text fallback result with metadata",
    )
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
    const usedContextInput = {
      ...contextInput,
      messages: messagesWithUsage,
    }
    writeEstimatedTokenCount(USED_SESSION_CAPPED_FULL_TEXT_LIMIT_TOKENS)
    const usedBoundaryResult = await ingestFullTextTool.run(
      { resourceKey: "capped-window-md" },
      createExecutionContext(usedContextInput),
    )
    const parsed_usedBoundaryResult = requireToolObjectResult(
      usedBoundaryResult,
      "Expected used-session ingest result with metadata",
    )
    const usedBoundaryMetadata = requireToolMetadata(parsed_usedBoundaryResult)
    expect(usedBoundaryMetadata.completed).toBe(true)
    expect(usedBoundaryMetadata.liveUsageEstimate).toBe(INCIDENT_LIVE_USAGE_TOKENS)
    expect(usedBoundaryMetadata.remainingAfterIngestion).toBe(
      FULL_TEXT_INPUT_WINDOW_CEILING_RESERVE_TOKENS,
    )
    writeEstimatedTokenCount(USED_SESSION_CAPPED_FULL_TEXT_LIMIT_TOKENS + ONE_TOKEN_OVER_BUDGET)
    const usedOverBoundaryResult = await ingestFullTextTool.run(
      { resourceKey: "capped-window-md" },
      createExecutionContext(usedContextInput),
    )
    const parsed_usedOverBoundaryResult = requireToolObjectResult(
      usedOverBoundaryResult,
      "Expected used-session fallback result with metadata",
    )
    const usedOverBoundaryMetadata = requireToolMetadata(parsed_usedOverBoundaryResult)
    expect(usedOverBoundaryMetadata.completed).toBe(false)
    expect(usedOverBoundaryMetadata.remainingAfterIngestion).toBe(
      FULL_TEXT_INPUT_WINDOW_CEILING_RESERVE_TOKENS - ONE_TOKEN_OVER_BUDGET,
    )
  })

  test("returns scoped-reading fallback instead of throwing when full text lacks headroom", async () => {
    await using project = await tmpdir({ git: true })
    await configureModels(project.path)

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

    const prepareResult = await prepareResourceTool.run(
      {
        sourcePath,
        alias: "small-window-md",
        waitUntilReady: true,
        maxWaitMs: 20_000,
      },
      createExecutionContext({
        directory: project.path,
        sessionID,
        messages,
        model: SMALL_TEST_ACTIVE_MODEL,
      }),
    )
    const parsed_prepareResult = requireToolObjectResult(
      prepareResult,
      "Expected prepare_resource object result",
    )
    expect(parsed_prepareResult.output).toContain("status=ready")
    const ingestResult = await ingestFullTextTool.run(
      { resourceKey: "small-window-md" },
      createExecutionContext({
        directory: project.path,
        sessionID,
        messages,
        model: SMALL_TEST_ACTIVE_MODEL,
      }),
    )
    const parsed_ingestResult = requireToolObjectResult(
      ingestResult,
      "Expected ingest_full_text object result",
    )
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
  })

  test("recalculates stale pack estimates before full-text admission", async () => {
    await using project = await tmpdir({ git: true })
    await configureModels(project.path)

    const sourcePath = path.join(project.path, "legacy-estimate.md")
    writeFileSync(sourcePath, "# Legacy Estimate\n\nShort placeholder.\n", "utf8")

    const sessionID = "ses_ingest_full_text_stale_estimate"
    const messages = createUserMessageHistory(sessionID)
    const contextInput = {
      directory: project.path,
      sessionID,
      messages,
      model: SMALL_TEST_ACTIVE_MODEL,
    }

    const prepareResult = await prepareResourceTool.run(
      {
        sourcePath,
        alias: "legacy-estimate-md",
        waitUntilReady: true,
        maxWaitMs: 20_000,
      },
      createExecutionContext(contextInput),
    )
    const parsed_prepareResult = requireToolObjectResult(
      prepareResult,
      "Expected prepare_resource object result",
    )
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
    const ingestResult = await ingestFullTextTool.run(
      { resourceKey: "legacy-estimate-md" },
      createExecutionContext(contextInput),
    )
    const parsed_ingestResult = requireToolObjectResult(
      ingestResult,
      "Expected stale-estimate fallback result with metadata",
    )
    const ingestMetadata = requireToolMetadata(parsed_ingestResult)
    expect(ingestMetadata.completed).toBe(false)
    expect(ingestMetadata.reason).toBe("context_too_full")
    expect(ingestMetadata.fallback).toBe("scoped_reading")
    expect(ingestMetadata.fullTextEstimatedTokens).toBe(recalculatedTokens)
    expect(parsed_ingestResult.output).not.toContain("<full_text>")
  })
})
