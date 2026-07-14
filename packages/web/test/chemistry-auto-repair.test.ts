import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import {
  reportChemistryRenderFailure,
  resetChemistryAutoRepairReportsForTests,
  shouldReportChemistryRenderFailure,
} from "../src/components/media/renderers/chemistry/auto-repair"
import { createFetchStub } from "./test-utils"

const originalFetch = globalThis.fetch

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

beforeEach(() => {
  resetChemistryAutoRepairReportsForTests()
})

afterEach(() => {
  globalThis.fetch = originalFetch
  resetChemistryAutoRepairReportsForTests()
})

describe("chemistry auto-repair reporting", () => {
  test("reports source failures but not renderer infrastructure failures", () => {
    expect(
      shouldReportChemistryRenderFailure({
        status: "error",
        message: "invalid structure",
        code: "invalid_source",
      }),
    ).toBe(true)
    expect(
      shouldReportChemistryRenderFailure({
        status: "error",
        message: "runtime unavailable",
        code: "chemfig_runtime_unavailable",
      }),
    ).toBe(false)
    expect(
      shouldReportChemistryRenderFailure({
        status: "error",
        message: "worker timed out",
        code: "indigo_render_timeout",
      }),
    ).toBe(false)
    expect(
      shouldReportChemistryRenderFailure({
        status: "error",
        message: "unclassified renderer failure",
      }),
    ).toBe(false)
    expect(
      shouldReportChemistryRenderFailure({
        status: "error",
        message: "TeX compile failed",
        code: "chemfig_tex_compile_failed",
      }),
    ).toBe(true)
    expect(shouldReportChemistryRenderFailure({ status: "loading" })).toBe(false)
  })

  test("sends no frontend renderer error and deduplicates an accepted report", async () => {
    const requests: Record<string, unknown>[] = []
    globalThis.fetch = createFetchStub(async (input, init) => {
      const requestInput =
        typeof input === "string" && input.startsWith("/")
          ? new URL(input, "http://localhost")
          : input
      const request = new Request(requestInput, init)
      const body: unknown = JSON.parse(await request.text())
      if (!isRecord(body)) throw new Error("Expected an object request body.")
      requests.push(body)
      return new Response(
        JSON.stringify({
          repairRequestID: "msg_buddy_svg_auto_repair_test",
          status: "running",
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      )
    })

    const input = {
      directory: "/repo",
      sessionID: "ses_chemistry",
      assistantMessageID: "msg_chemistry",
      partID: "prt_chemistry",
      segmentIndex: 2,
      rawFence: "```smiles\ninvalid\n```",
      format: "smiles",
      source: "invalid",
    } satisfies Parameters<typeof reportChemistryRenderFailure>[0]
    const first = await reportChemistryRenderFailure(input)
    const second = await reportChemistryRenderFailure(input)

    expect(first).toEqual(second)
    expect(requests).toHaveLength(1)
    expect(requests[0]).toEqual({
      assistantMessageID: "msg_chemistry",
      partID: "prt_chemistry",
      segmentIndex: 2,
      rawFence: "```smiles\ninvalid\n```",
      format: "smiles",
      source: "invalid",
    })
    expect(requests[0]).not.toHaveProperty("error")
    expect(requests[0]).not.toHaveProperty("message")
    expect(requests[0]).not.toHaveProperty("code")
  })
})
