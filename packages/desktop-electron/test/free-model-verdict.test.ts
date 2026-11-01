import { expect, test } from "bun:test"
import { freeModelVerdict } from "../scripts/smoke-free-models"

const allowance = 'HTTP 429: {"error":{"type":"FreeUsageLimitError"}}'

test("Buddy failing while the control passes is a Buddy failure", () => {
  expect(freeModelVerdict({ buddyFailure: "anything", controlPassed: true })).toBe("buddy-broken")
})

test("both refused by the free allowance is inconclusive", () => {
  expect(
    freeModelVerdict({
      buddyFailure: "AI.Error: Free usage limit reached.",
      controlPassed: false,
      controlFailure: allowance,
    }),
  ).toBe("inconclusive")
})

test("Buddy failing before it reaches the allowance is a Buddy failure", () => {
  expect(
    freeModelVerdict({
      buddyFailure: "Model unavailable: opencode/beam-free",
      controlPassed: false,
      controlFailure: allowance,
    }),
  ).toBe("buddy-broken")
})

test("a control that cannot reach the network is inconclusive", () => {
  expect(
    freeModelVerdict({
      buddyFailure: "Model unavailable: opencode/beam-free",
      controlPassed: false,
      controlFailure: "request: fetch failed",
    }),
  ).toBe("inconclusive")
})
