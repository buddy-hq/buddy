import { describe, expect, test } from "bun:test"
import { createGeneralSettingsStore } from "../src/state/general-settings-store"

describe("createGeneralSettingsStore", () => {
  test("initializeFromBundle does not overwrite a dirty draft for the same initialized key", () => {
    const store = createGeneralSettingsStore()
    const bundle = {
      globalConfig: {
        tools: {
          pedagogy_resource_ingest_full_text: true,
        },
        compaction: {
          auto: true,
        },
      },
    }

    store.getState().initializeFromBundle("", bundle)
    store.getState().setFullTextReadingEnabled(false)
    store.getState().initializeFromBundle("", {
      ...bundle,
      globalConfig: {
        ...bundle.globalConfig,
        tools: {
          pedagogy_resource_ingest_full_text: true,
        },
      },
    })

    expect(store.getState().draft.fullTextReadingEnabled).toBe(false)
  })

  test("replaceFromBundle refreshes the draft for the active initialized key", () => {
    const store = createGeneralSettingsStore()
    const bundle = {
      globalConfig: {
        tools: {
          pedagogy_resource_ingest_full_text: true,
        },
        compaction: {
          auto: true,
        },
      },
    }

    store.getState().initializeFromBundle("", bundle)
    store.getState().setFullTextReadingEnabled(false)
    store.getState().replaceFromBundle("", {
      ...bundle,
      globalConfig: {
        ...bundle.globalConfig,
        tools: {
          pedagogy_resource_ingest_full_text: true,
        },
      },
    })

    expect(store.getState().draft.fullTextReadingEnabled).toBe(true)
  })
})
