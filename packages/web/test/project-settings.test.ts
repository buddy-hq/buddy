import { describe, expect, test } from "bun:test"
import { resolveModelSelectionDirtyAfterPersist } from "../src/state/project-settings"

describe("resolveModelSelectionDirtyAfterPersist", () => {
  test("keeps model selection dirty when the draft changed during an in-flight save", () => {
    expect(
      resolveModelSelectionDirtyAfterPersist({
        draft: {
          persona: "",
          provider: "kimi",
          model: "kimi-k2-thinking",
          logLevel: "",
          fullTextReadingEnabled: true,
          autoCompactionEnabled: true,
        },
        modelSelectionDirty: true,
        patch: {
          model: "kimi/kimi-k2",
        },
      }),
    ).toBe(true)
  })

  test("clears model selection dirty when the persisted model matches the current draft", () => {
    expect(
      resolveModelSelectionDirtyAfterPersist({
        draft: {
          persona: "",
          provider: "kimi",
          model: "kimi-k2-thinking",
          logLevel: "",
          fullTextReadingEnabled: true,
          autoCompactionEnabled: true,
        },
        modelSelectionDirty: true,
        patch: {
          model: "kimi/kimi-k2-thinking",
        },
      }),
    ).toBe(false)
  })

  test("preserves the dirty flag when the save did not persist a model patch", () => {
    expect(
      resolveModelSelectionDirtyAfterPersist({
        draft: {
          persona: "",
          provider: "kimi",
          model: "kimi-k2-thinking",
          logLevel: "",
          fullTextReadingEnabled: true,
          autoCompactionEnabled: true,
        },
        modelSelectionDirty: true,
        patch: {
          default_persona: "buddy",
        },
      }),
    ).toBe(true)
  })
})
