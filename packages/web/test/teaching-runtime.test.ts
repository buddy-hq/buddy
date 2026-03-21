import { describe, expect, test } from "bun:test"
import { intentFromSelection } from "../src/state/teaching-runtime"

describe("intentFromSelection", () => {
  test("returns auto when the UI is left on Auto", () => {
    expect(intentFromSelection("auto")).toBe("auto")
  })

  test("passes through explicit teaching intents", () => {
    expect(intentFromSelection("learn")).toBe("learn")
    expect(intentFromSelection("practice")).toBe("practice")
    expect(intentFromSelection("assess")).toBe("assess")
  })
})
