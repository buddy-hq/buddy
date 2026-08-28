import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import {
  reportChemistryRenderFailure,
  resetChemistryAutoRepairReportsForTests,
  shouldReportChemistryRenderFailure,
} from "../src/components/media/renderers/chemistry/auto-repair"
import { installTestFetch, restoreTestFetch } from "./test-utils"
import { parseJsonObjectText, parseStringValue, type TBuddyConfigObject } from "./parse-test-values"

const originalFetch = globalThis.fetch

beforeEach(() => {
  resetChemistryAutoRepairReportsForTests()
})

afterEach(() => {
  restoreTestFetch(originalFetch)
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
    const requests: TBuddyConfigObject[] = []
    installTestFetch(async (input, init) => {
      const asString = parseStringValue(input)
      const requestInput =
        asString !== undefined && asString.startsWith("/")
          ? new URL(asString, "http://localhost")
          : input
      const request = new Request(requestInput, init)
      const body = parseJsonObjectText(await request.text())
      if (body === undefined) throw new Error("Expected an object request body.")
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
