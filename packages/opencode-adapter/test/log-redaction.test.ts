import { expect, test } from "bun:test"
import { Cause } from "effect"
import { formatOpenCodeLogDetails, redactLogText } from "../src/log-redaction"

test("redacts OAuth query parameters from an Effect cause while preserving the failure", () => {
  const details = formatOpenCodeLogDetails({
    cause: Cause.die(new Error('Failed query: update "credential" set "value" = ?\nparams: {"type":"oauth","access":"at-123","refresh":"rt-456"}')),
  }).join("\n")

  expect(details).not.toContain("at-123")
  expect(details).not.toContain("rt-456")
  expect(details).toContain("Failed query")
})

test("redacts nested API credentials while preserving other attributes", () => {
  const details = formatOpenCodeLogDetails({
    attributes: { credential: { type: "api", key: "sk-secret" }, server: "docs" },
  }).join("\n")

  expect(details).toContain("docs")
  expect(details).not.toContain("sk-secret")
})

test("redacts bearer tokens and credential strings containing escaped quotes", () => {
  expect(redactLogText("Authorization: Bearer abc.def-ghi")).not.toContain("abc.def-ghi")

  const escaped = redactLogText('"clientSecret":"x\\"y"')
  expect(escaped).not.toContain('x\\"y')
  expect(escaped).toBe('"clientSecret":"[redacted]"')
})

test("preserves an ordinary failure message", () => {
  expect(redactLogText("Failed to drain Session")).toBe("Failed to drain Session")
})
