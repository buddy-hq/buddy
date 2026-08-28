import { describe, expect, test } from "bun:test"
import { createGeneralSettingsStore } from "../src/state/general-settings-store"
import {
  createAutosavePayloadKey,
  retainFailedAutosaveKey,
  shouldSkipFailedAutosave,
} from "../src/state/settings-autosave"

describe("createGeneralSettingsStore", () => {
  test("initializeFromBundle does not overwrite a dirty draft for the same initialized key", () => {
    const store = createGeneralSettingsStore()
    const bundle = {
      globalConfig: {
        tools: {
          ingest_full_text: true,
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
          ingest_full_text: true,
        },
      },
    })

    expect(store.getState().draft.fullTextReadingEnabled).toBe(false)
  })

})

describe("settings autosave retry guards", () => {
  test("blocks only the exact failed autosave payload unless forced", () => {
    const failedKey = createAutosavePayloadKey({
      tools: {
        ingest_full_text: false,
      },
    })
    const changedKey = createAutosavePayloadKey({
      tools: {
        ingest_full_text: true,
      },
    })

    expect(shouldSkipFailedAutosave({ key: failedKey, failedKey })).toBe(true)
    expect(shouldSkipFailedAutosave({ key: changedKey, failedKey })).toBe(false)
    expect(shouldSkipFailedAutosave({ key: failedKey, failedKey, force: true })).toBe(false)
  })

  test("drops remembered failures when no payload is pending", () => {
    const failedKey = createAutosavePayloadKey({
      tools: {
        ingest_full_text: false,
      },
    })

    expect(retainFailedAutosaveKey({ key: undefined, failedKey })).toBeUndefined()
    expect(retainFailedAutosaveKey({ key: failedKey, failedKey })).toBe(failedKey)
  })
})
