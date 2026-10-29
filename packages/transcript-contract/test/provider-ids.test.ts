import { describe, expect, test } from "bun:test"
import { currentProviderID } from "../src/provider-ids"

describe("currentProviderID", () => {
  test("maps the former Azure provider ID", () => {
    expect(currentProviderID("azure-cognitive-services")).toBe("azure")
  })

  test("maps the former Vertex Anthropic provider ID", () => {
    expect(currentProviderID("google-vertex-anthropic")).toBe("google-vertex")
  })

  test("preserves unrelated provider IDs", () => {
    expect(currentProviderID("anthropic")).toBe("anthropic")
  })
})
