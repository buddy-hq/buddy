import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { publishGlobalEvent } from "@buddy/opencode-adapter/global-event"
import { app } from "../../src/index"
import {
  readSvgAutoRepairRequest,
  svgAutoRepairScratchFile,
} from "../../src/learning/features/svg-rendering/service/auto-repair"
import { SVG_REPORTED_FENCE_MAX_BYTES } from "../../src/learning/features/svg-rendering/service/contracts"
import {
  containsStandaloneReportedSvgFence,
  reportedSvgFenceMatches,
  setSessionInteractionRuntimeOverrides,
  subscribeSvgAutoRepairTurnSettlement,
} from "../../src/session/orchestration/interaction-actions"
import { tmpdir } from "../helpers/tmpdir"

const SESSION_ID = "ses_svg_repair_route"
const ASSISTANT_MESSAGE_ID = "msg_failed_chemistry"
const PART_ID = "prt_failed_chemistry"
const RAW_FENCE = "```smiles\ninvalid structure\n```"

let queuedPromptBodies: Record<string, unknown>[] = []
let repairTurnSettlements: Array<{
  repairRequestID: string
  settle(errorMessage: string): Promise<void>
}> = []
let restoreRuntime: () => void = () => undefined

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

async function repairResponseBody(response: Response): Promise<{
  repairRequestID: string
  status?: string
}> {
  const value: unknown = await response.json()
  if (!isRecord(value) || typeof value.repairRequestID !== "string") {
    throw new Error("Expected an SVG repair response body.")
  }
  return {
    repairRequestID: value.repairRequestID,
    ...(typeof value.status === "string" ? { status: value.status } : {}),
  }
}

beforeEach(() => {
  queuedPromptBodies = []
  repairTurnSettlements = []
  restoreRuntime = setSessionInteractionRuntimeOverrides({
    assertSessionExists: async () => undefined,
    createPromptTransform: () => ({
      onTransform: async (body) => body,
    }),
    sendPromptAsync: async (input) => {
      queuedPromptBodies.push(input.body)
      return {}
    },
    resolveSvgAutoRepairOrigin: async () => ({
      agent: "buddy",
      model: {
        providerID: "opencode",
        modelID: "claude-sonnet",
      },
    }),
    subscribeSvgAutoRepairTurnSettlement: (input) => {
      const settlement = {
        repairRequestID: input.repairRequestID,
        settle: input.settle,
      }
      repairTurnSettlements.push(settlement)
      return () => {
        const index = repairTurnSettlements.indexOf(settlement)
        if (index >= 0) repairTurnSettlements.splice(index, 1)
      }
    },
  })
})

afterEach(() => {
  restoreRuntime()
  restoreRuntime = () => undefined
})

function repairRequest(
  directory: string,
  overrides: { rawFence?: string; segmentIndex?: number; source?: string } = {},
): Request {
  return new Request(
    `http://localhost/api/session/${SESSION_ID}/svg-repair-async?directory=${encodeURIComponent(directory)}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-buddy-directory": directory,
      },
      body: JSON.stringify({
        assistantMessageID: ASSISTANT_MESSAGE_ID,
        partID: PART_ID,
        segmentIndex: overrides.segmentIndex ?? 0,
        rawFence: overrides.rawFence ?? RAW_FENCE,
        format: "smiles",
        source: overrides.source ?? "invalid structure",
      }),
    },
  )
}

describe("SVG auto-repair route", () => {
  test("observes completion only for the matching hidden assistant turn", async () => {
    const messages: string[] = []
    const repairRequestID = "msg_buddy_svg_auto_repair_test"
    const unsubscribe = subscribeSvgAutoRepairTurnSettlement({
      directory: "/workspace",
      sessionID: SESSION_ID,
      repairRequestID,
      settle: async (message) => {
        messages.push(message)
      },
    })

    publishGlobalEvent({
      directory: "/workspace",
      payload: {
        type: "message.updated",
        properties: {
          sessionID: SESSION_ID,
          info: {
            role: "assistant",
            parentID: "msg_unrelated",
            time: { completed: Date.now() },
          },
        },
      },
    })
    expect(messages).toEqual([])

    publishGlobalEvent({
      directory: "/workspace",
      payload: {
        type: "message.updated",
        properties: {
          sessionID: SESSION_ID,
          info: {
            role: "assistant",
            parentID: repairRequestID,
            time: { completed: Date.now() },
          },
        },
      },
    })
    expect(messages).toEqual([
      "Automatic SVG repair completed without producing a validated SVG.",
    ])

    publishGlobalEvent({
      directory: "/workspace",
      payload: {
        type: "session.error",
        properties: { sessionID: SESSION_ID },
      },
    })
    expect(messages).toHaveLength(1)
    unsubscribe()
  })

  test("accepts only standalone transcript fences with the first valid closing delimiter", () => {
    expect(
      containsStandaloneReportedSvgFence(
        `Before\r\n${RAW_FENCE}\r\nAfter`,
        RAW_FENCE,
      ),
    ).toBe(true)
    expect(containsStandaloneReportedSvgFence(`Before ${RAW_FENCE}`, RAW_FENCE)).toBe(
      false,
    )
    expect(containsStandaloneReportedSvgFence(`${RAW_FENCE} after`, RAW_FENCE)).toBe(
      false,
    )
    expect(
      reportedSvgFenceMatches({
        format: "smiles",
        rawFence: "```smiles\ninvalid\n```\nnot part of the fence\n```",
        source: "invalid\n```\nnot part of the fence",
      }),
    ).toBe(false)
  })

  test("queues one hidden repair turn using the existing render_svg tool", async () => {
    await using project = await tmpdir({ git: true })
    const response = await app.request(repairRequest(project.path))

    expect(response.status).toBe(200)
    const body = await repairResponseBody(response)
    expect(body.repairRequestID).toStartWith("msg_buddy_svg_auto_repair_")
    expect(body.status).toBe("running")
    expect(queuedPromptBodies).toHaveLength(1)

    const promptBody = queuedPromptBodies[0]
    expect(promptBody).toMatchObject({
      messageID: body.repairRequestID,
      agent: "buddy",
      model: {
        providerID: "opencode",
        modelID: "claude-sonnet",
      },
    })
    const content = typeof promptBody?.content === "string" ? promptBody.content : ""
    expect(content).toContain("render_svg")
    expect(content).toContain("at most 4 times")
    expect(content).toContain('"invalid structure"')
    expect(content).not.toContain("```smiles\ninvalid structure\n```")
    expect(content).toContain(svgAutoRepairScratchFile(project.path, body.repairRequestID))
    expect(content).not.toContain("Browser render error")

    expect(await readSvgAutoRepairRequest(project.path, body.repairRequestID)).toMatchObject({
      sessionID: SESSION_ID,
      assistantMessageID: ASSISTANT_MESSAGE_ID,
      partID: PART_ID,
      segmentIndex: 0,
      format: "smiles",
      source: "invalid structure",
      status: "running",
      renderAttempts: 0,
    })
  })

  test("exhausts a hidden turn that completes without a validated render", async () => {
    await using project = await tmpdir({ git: true })
    const response = await app.request(repairRequest(project.path))
    const body = await repairResponseBody(response)
    const settlement = repairTurnSettlements.find(
      (entry) => entry.repairRequestID === body.repairRequestID,
    )
    if (!settlement) throw new Error("Expected an SVG repair turn subscription.")

    await settlement.settle("Repair turn completed without a validated render.")

    const request = await readSvgAutoRepairRequest(project.path, body.repairRequestID)
    expect(request).toMatchObject({
      status: "exhausted",
      lastErrorMessage: "Repair turn completed without a validated render.",
    })
    expect(request).not.toHaveProperty("source")
  })

  test("deduplicates repeated reports for the same failed fence", async () => {
    await using project = await tmpdir({ git: true })
    const first = await app.request(repairRequest(project.path))
    const firstBody = await repairResponseBody(first)
    const second = await app.request(repairRequest(project.path, { segmentIndex: 7 }))
    const secondBody = await repairResponseBody(second)

    expect(second.status).toBe(200)
    expect(secondBody.repairRequestID).toBe(firstBody.repairRequestID)
    expect(queuedPromptBodies).toHaveLength(1)
  })

  test("does not serialize independent repairs behind a Buddy turn gate", async () => {
    await using project = await tmpdir({ git: true })
    const [first, second] = await Promise.all([
      app.request(repairRequest(project.path)),
      app.request(
        repairRequest(project.path, {
          rawFence: "```smiles\nsecond invalid structure\n```",
          segmentIndex: 1,
          source: "second invalid structure",
        }),
      ),
    ])

    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    expect(queuedPromptBodies).toHaveLength(2)
  })

  test("rejects a report that does not match the preserved fence", async () => {
    await using project = await tmpdir({ git: true })
    const request = repairRequest(project.path)
    const body: unknown = await request.json()
    if (!isRecord(body)) throw new Error("Expected the seeded request body.")
    const response = await app.request(
      new Request(request.url, {
        method: "POST",
        headers: request.headers,
        body: JSON.stringify({
          ...body,
          source: "invalid",
        }),
      }),
    )

    expect(response.status).toBe(400)
    expect(queuedPromptBodies).toEqual([])
  })

  test("accepts an exact indented CRLF tilde fence", async () => {
    await using project = await tmpdir({ git: true })
    const response = await app.request(
      repairRequest(project.path, {
        rawFence: "   ~~~~SMILES title=structure\r\n   invalid structure\r\n   ~~~~",
      }),
    )

    expect(response.status).toBe(200)
    await repairResponseBody(response)
  })

  test("rejects a reported fence that exceeds the bounded request size", async () => {
    await using project = await tmpdir({ git: true })
    const response = await app.request(
      repairRequest(project.path, {
        rawFence: `\`\`\`smiles\n${"x".repeat(SVG_REPORTED_FENCE_MAX_BYTES)}\n\`\`\``,
        source: "x",
      }),
    )

    expect(response.status).toBe(400)
    expect(queuedPromptBodies).toEqual([])
  })

  test("rejects an oversized wire body before JSON validation", async () => {
    await using project = await tmpdir({ git: true })
    const request = repairRequest(project.path)
    const response = await app.request(
      new Request(request, {
        headers: {
          ...Object.fromEntries(request.headers),
          "content-length": String(Number.MAX_SAFE_INTEGER),
        },
      }),
    )

    expect(response.status).toBe(413)
    expect(queuedPromptBodies).toEqual([])
  })
})
