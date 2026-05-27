import { beforeEach, describe, expect, test } from "bun:test"
import {
  createTextPromptDraft,
  flushPromptStorePersistence,
  getPromptDraft,
  getPromptScopeKey,
  PROMPT_STORE_STORAGE_KEY,
  usePromptStore,
} from "../src/state/prompt-store"
import { createBrowserPlatform, setRuntimePlatform, type Platform } from "../src/context/platform"

function resetPromptStore() {
  setRuntimePlatform(createBrowserPlatform())
  usePromptStore.setState({
    draftsByKey: {},
    historyByDirectory: {},
    historyNavigationByKey: {},
  })
  flushPromptStorePersistence()
  localStorage.removeItem(PROMPT_STORE_STORAGE_KEY)
}

describe("prompt store", () => {
  beforeEach(() => {
    resetPromptStore()
  })

  test("keeps drafts isolated per session key", () => {
    const store = usePromptStore.getState()
    const leftKey = getPromptScopeKey("/repo", "left")
    const rightKey = getPromptScopeKey("/repo", "right")

    store.replaceDraft(leftKey, createTextPromptDraft("left draft"))
    store.replaceDraft(rightKey, createTextPromptDraft("right draft"))

    expect(getPromptDraft(usePromptStore.getState(), leftKey).value).toBe("left draft")
    expect(getPromptDraft(usePromptStore.getState(), rightKey).value).toBe("right draft")
  })

  test("migrates the workspace draft into a new session when the target is empty", () => {
    const store = usePromptStore.getState()
    const workspaceKey = getPromptScopeKey("/repo")
    const sessionKey = getPromptScopeKey("/repo", "session-1")

    store.replaceDraft(workspaceKey, createTextPromptDraft("workspace draft"))
    store.migrateWorkspaceDraft("/repo", "session-1")

    expect(getPromptDraft(usePromptStore.getState(), workspaceKey).value).toBe("")
    expect(getPromptDraft(usePromptStore.getState(), sessionKey).value).toBe("workspace draft")
  })

  test("does not overwrite an existing session draft during workspace migration", () => {
    const store = usePromptStore.getState()
    const workspaceKey = getPromptScopeKey("/repo")
    const sessionKey = getPromptScopeKey("/repo", "session-1")

    store.replaceDraft(workspaceKey, createTextPromptDraft("workspace draft"))
    store.replaceDraft(sessionKey, createTextPromptDraft("session draft"))
    store.migrateWorkspaceDraft("/repo", "session-1")

    expect(getPromptDraft(usePromptStore.getState(), workspaceKey).value).toBe("workspace draft")
    expect(getPromptDraft(usePromptStore.getState(), sessionKey).value).toBe("session draft")
  })

  test("does not persist every draft update synchronously", () => {
    const store = usePromptStore.getState()
    const key = getPromptScopeKey("/repo", "session-1")

    store.replaceDraft(key, createTextPromptDraft("draft"))

    expect(localStorage.getItem(PROMPT_STORE_STORAGE_KEY)).toBeNull()

    flushPromptStorePersistence()

    const raw = localStorage.getItem(PROMPT_STORE_STORAGE_KEY)
    expect(raw).not.toBeNull()
    expect(raw).toContain("draft")
  })

  test("flushes platform storage after prompt persistence writes", () => {
    const writes = new Map<string, string>()
    let flushCount = 0
    const storage = {
      getItem(key: string) {
        return writes.get(key) ?? null
      },
      setItem(key: string, value: string) {
        writes.set(key, value)
      },
      removeItem(key: string) {
        writes.delete(key)
      },
      flush() {
        flushCount += 1
      },
    }
    setRuntimePlatform({
      ...createBrowserPlatform(),
      storage() {
        return storage
      },
    } satisfies Platform)

    const store = usePromptStore.getState()
    store.replaceDraft(getPromptScopeKey("/repo", "session-1"), createTextPromptDraft("draft"))
    flushPromptStorePersistence()

    expect(writes.get(PROMPT_STORE_STORAGE_KEY)).toContain("draft")
    expect(flushCount).toBe(1)
  })

  test("ignores equivalent draft writes", () => {
    const store = usePromptStore.getState()
    const key = getPromptScopeKey("/repo", "session-1")

    store.replaceDraft(key, createTextPromptDraft("draft"))
    const firstDraft = getPromptDraft(usePromptStore.getState(), key)

    store.replaceDraft(key, createTextPromptDraft("draft"))

    expect(getPromptDraft(usePromptStore.getState(), key)).toBe(firstDraft)
  })
})
