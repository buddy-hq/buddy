import { describe, expect, test } from "bun:test"
import { intentOverrideFromSelection } from "../src/state/teaching-runtime"

describe("intentOverrideFromSelection", () => {
  test("returns undefined when the UI is left on Auto", () => {
    expect(intentOverrideFromSelection("auto")).toBeUndefined()
  })

  test("passes through explicit teaching intents", () => {
    expect(intentOverrideFromSelection("learn")).toBe("learn")
    expect(intentOverrideFromSelection("practice")).toBe("practice")
    expect(intentOverrideFromSelection("assess")).toBe("assess")
  })
})
