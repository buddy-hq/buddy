import { expect, test } from "bun:test"
import { toolOutcome } from "../src/gateway/tool-presentation"

test("shows a tool interrupted by the v2 migration as interrupted", () => {
  expect(
    toolOutcome("read", {
      status: "error",
      input: {},
      error: {
        type: "tool.interrupted",
        message: "Tool execution was interrupted before V2 migration",
      },
    }),
  ).toEqual({ type: "interrupted" })
})
