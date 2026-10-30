import { afterEach, beforeEach, expect, test } from "bun:test"
import { createJSONStorage } from "zustand/middleware"
import {
  CHAT_ACCESS_MODE_STORAGE_KEY,
  useChatAccessModeStore,
  waitForChatAccessModeHydration,
} from "../src/state/chat-access-mode-store"

beforeEach(() => {
  useChatAccessModeStore.setState({ lastModeByDirectory: {} })
})

afterEach(() => {
  useChatAccessModeStore.setState({ lastModeByDirectory: {} })
  localStorage.removeItem(CHAT_ACCESS_MODE_STORAGE_KEY)
  useChatAccessModeStore.persist.setOptions({
    storage: createJSONStorage(() => localStorage),
  })
})

test("remembers each notebook's last choice across hydration, including Default", async () => {
  const store = useChatAccessModeStore.getState()
  store.setLastMode("/one", "full")
  store.setLastMode("/two", "supervised")
  store.setLastMode("/three", "full")
  store.setLastMode("/three", "default")
  const persisted = localStorage.getItem(CHAT_ACCESS_MODE_STORAGE_KEY)
  useChatAccessModeStore.setState({ lastModeByDirectory: {} })
  if (!persisted) throw new Error("Expected persisted notebook access modes")
  localStorage.setItem(CHAT_ACCESS_MODE_STORAGE_KEY, persisted)

  await useChatAccessModeStore.persist.rehydrate()

  expect(useChatAccessModeStore.getState().lastModeByDirectory).toEqual({
    "/one": "full",
    "/two": "supervised",
    "/three": "default",
  })
})

test("invalid persisted modes become Default without losing valid notebook choices", async () => {
  localStorage.setItem(
    CHAT_ACCESS_MODE_STORAGE_KEY,
    JSON.stringify({
      version: 1,
      state: { lastModeByDirectory: { "/one": "full", "/two": "always", "/three": null } },
    }),
  )

  await useChatAccessModeStore.persist.rehydrate()

  expect(useChatAccessModeStore.getState().lastModeByDirectory).toEqual({
    "/one": "full",
    "/two": "default",
    "/three": "default",
  })
})

test("a delayed hydration preserves choices made while storage was loading", async () => {
  const loaded = Promise.withResolvers<string | null>()
  let saved: string | null = JSON.stringify({
    version: 1,
    state: { lastModeByDirectory: { "/one": "full", "/two": "full" } },
  })
  const readSnapshot = saved
  useChatAccessModeStore.persist.setOptions({
    storage: createJSONStorage(() => ({
      getItem: () => loaded.promise,
      setItem: (_key, value) => {
        saved = value
      },
      removeItem: () => undefined,
    })),
  })
  const hydration = useChatAccessModeStore.persist.rehydrate()
  useChatAccessModeStore.getState().setLastMode("/one", "supervised")
  loaded.resolve(readSnapshot)
  await hydration

  expect(useChatAccessModeStore.getState().lastModeByDirectory).toEqual({
    "/one": "supervised",
    "/two": "full",
  })
  if (!saved) throw new Error("Expected the merged notebook choices to be saved")
  expect(JSON.parse(saved)).toEqual({
    version: 1,
    state: { lastModeByDirectory: { "/one": "supervised", "/two": "full" } },
  })

  const persisted = saved
  useChatAccessModeStore.setState({ lastModeByDirectory: {} })
  saved = persisted
  useChatAccessModeStore.persist.setOptions({
    storage: createJSONStorage(() => ({
      getItem: () => saved,
      setItem: (_key, value) => {
        saved = value
      },
      removeItem: () => undefined,
    })),
  })
  await useChatAccessModeStore.persist.rehydrate()

  expect(useChatAccessModeStore.getState().lastModeByDirectory).toEqual({
    "/one": "supervised",
    "/two": "full",
  })
})

test("a failed merged save stays dirty until a successful hydration saves both choices", async () => {
  const loaded = Promise.withResolvers<string | null>()
  let saved: string | null = JSON.stringify({
    version: 1,
    state: { lastModeByDirectory: { "/one": "full", "/two": "supervised" } },
  })
  const snapshot = saved
  let reads = 0
  let failSave = false
  useChatAccessModeStore.persist.setOptions({
    storage: createJSONStorage(() => ({
      getItem: async () => {
        reads += 1
        return reads === 1 ? loaded.promise : saved
      },
      setItem: async (_key, value) => {
        if (failSave) throw new Error("Storage write failed")
        saved = value
      },
      removeItem: () => undefined,
    })),
  })
  const hydration = useChatAccessModeStore.persist.rehydrate()
  useChatAccessModeStore.getState().setLastMode("/one", "supervised")
  failSave = true
  try {
    loaded.resolve(snapshot)
    await hydration
    expect(await waitForChatAccessModeHydration()).toBe(false)

    failSave = false
    await useChatAccessModeStore.persist.rehydrate()
    expect(await waitForChatAccessModeHydration()).toBe(true)
    if (!saved) throw new Error("Expected both notebook choices to be saved")
    expect(JSON.parse(saved)).toEqual({
      version: 1,
      state: { lastModeByDirectory: { "/one": "supervised", "/two": "supervised" } },
    })
  } finally {
    failSave = false
    loaded.resolve(snapshot)
    await hydration
  }
})
