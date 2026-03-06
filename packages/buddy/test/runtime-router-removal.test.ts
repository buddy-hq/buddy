import { describe, expect, test } from "bun:test"
import { TEACHING_ROUTER_REMOVED } from "../src/learning/runtime/router.js"

describe("teaching router removal", () => {
  test("keeps deterministic pedagogy routing disabled", () => {
    expect(TEACHING_ROUTER_REMOVED).toBe(true)
  })
})
