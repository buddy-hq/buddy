import { describe, expect, test } from "bun:test"
import {
  createIdleUpdateProgress,
  isUpdateRing,
  normalizeUpdateRing,
} from "../src/shared/update-state"

describe("update state", () => {
  test("validates and normalizes update rings", () => {
    expect(isUpdateRing("stable")).toBe(true)
    expect(isUpdateRing("preview")).toBe(true)
    expect(isUpdateRing("beta")).toBe(false)
    expect(normalizeUpdateRing("preview")).toBe("preview")
    expect(normalizeUpdateRing("beta")).toBe("stable")
    expect(normalizeUpdateRing(undefined)).toBe("stable")
  })

  test("creates idle progress snapshots for the selected ring", () => {
    expect(createIdleUpdateProgress("preview")).toEqual({
      ring: "preview",
      status: "idle",
    })
  })
})
