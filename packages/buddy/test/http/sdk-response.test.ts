import { describe, expect, test } from "bun:test"
import { extractSdkErrorMessage } from "../../src/http/sdk-response"

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
