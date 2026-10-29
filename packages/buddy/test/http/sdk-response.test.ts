import { describe, expect, test } from "bun:test"
import { extractSdkErrorMessage, sdkErrorResponse } from "../../src/http/sdk-response"
import { classifyRouteError } from "../../src/http/route-errors"
import { normalizeErrorResponse } from "../../src/http/error-normalization"

describe("extractSdkErrorMessage", () => {
  test("keeps Error instance messages from SDK fetch failures", () => {
    expect(extractSdkErrorMessage(new Error("The operation was aborted."))).toBe(
      "The operation was aborted.",
    )
  })

  test("keeps JSON payload messages", () => {
    expect(extractSdkErrorMessage({ error: "Session is already running" })).toBe(
      "Session is already running",
    )
    expect(extractSdkErrorMessage({ message: "Network request failed" })).toBe(
      "Network request failed",
    )
    expect(extractSdkErrorMessage({ data: { message: "nested failure" } })).toBe("nested failure")
    expect(extractSdkErrorMessage({ name: "AbortError", data: { name: "TimeoutError" } })).toBe(
      "AbortError: TimeoutError",
    )
  })
})

test("unknown route failures hide internal messages and correlate their full cause with the log", async () => {
  const logs: string[] = []
  const failure = new Error("Private wrapper message", { cause: new Error("Private root cause") })
  const result = await classifyRouteError(failure, (line, cause) => logs.push(`${line}\n${cause}`))
  expect(result.status).toBe(500)
  expect(result.body).toEqual({ error: "Internal server error", code: "internal", errorID: expect.any(String) })
  expect(result.body.errorID).toMatch(/^[a-f0-9-]{36}$/u)
  expect(logs.join("\n")).toContain(`errorID=${result.body.errorID}`)
  expect(logs.join("\n")).toContain("Private wrapper message")
  expect(logs.join("\n")).toContain("Private root cause")
})

test("SDK and HTTP normalization preserve error codes, correlation IDs, and config details", async () => {
  const body = { error: "Invalid config", code: "config.invalid", errorID: "correlation", details: { path: "models.gpt.settings.compaction", file: "/notebook/.buddy/buddy.jsonc" } }
  const response = await normalizeErrorResponse(await sdkErrorResponse({ error: body, response: new Response(null, { status: 400 }) }))
  expect(response.status).toBe(400)
  expect(await response.json()).toEqual(body)
})
