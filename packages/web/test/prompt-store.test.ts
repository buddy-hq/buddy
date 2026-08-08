import { beforeEach, describe, expect, test } from "bun:test"
import {
  READER_ANCHOR_KIND_CFI_TEXT,
  READER_ANCHOR_KIND_PDF_TEXT,
} from "@buddy/reader-contract"
import {
  createTextPromptDraft,
  flushPromptStorePersistence,
  getPromptDraft,
  getPromptScopeKey,
  PROMPT_STORE_STORAGE_KEY,
  PROMPT_STORE_VERSION,
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

  test("persists only completed native resource uploads", () => {
    const key = getPromptScopeKey("/repo", "session-native")
    usePromptStore.getState().replaceDraft(key, {
      value: "",
      parts: [],
      cursor: 0,
      attachments: [
        {
          id: "copying",
          filename: "external-source.docx",
          mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          kind: "native-resource",
          format: "docx",
          delivery: "resource-only",
          status: "copying",
        },
        {
          id: "ready",
          filename: "ready.xlsx",
          mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          kind: "native-resource",
          format: "xlsx",
          delivery: "resource-only",
          status: "ready",
          uploadID: "abcdefghij",
          workspacePath: "uploads/ready--abcdefghij.xlsx",
          localPath: "/repo/uploads/ready--abcdefghij.xlsx",
          sizeBytes: 10,
        },
      ],
    })
    flushPromptStorePersistence()

    const raw = localStorage.getItem(PROMPT_STORE_STORAGE_KEY)
    expect(raw).toContain("ready--abcdefghij.xlsx")
    expect(raw).not.toContain("external-source.docx")
    expect(raw).not.toContain('"status":"copying"')
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

  test("migrates persisted legacy CFI selections to neutral text anchors", async () => {
    const key = getPromptScopeKey("/repo", "session-1")
    localStorage.setItem(
      PROMPT_STORE_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        state: {
          draftsByKey: {
            [key]: {
              value: '"Legacy selected text"',
              parts: [
                {
                  type: "selection-context",
                  source: "reading",
                  text: "Legacy selected text",
                  selectionKey: "selection-legacy",
                  cfi: "epubcfi(/6/2)",
                  index: 1,
                },
              ],
              attachments: [],
              cursor: 0,
              updatedAt: 1,
            },
          },
          historyByDirectory: {},
        },
      }),
    )

    await usePromptStore.persist.rehydrate()

    expect(getPromptDraft(usePromptStore.getState(), key).parts).toEqual([
      {
        type: "selection-context",
        source: "reading",
        text: "Legacy selected text",
        selectionKey: "selection-legacy",
        anchor: {
          kind: READER_ANCHOR_KIND_CFI_TEXT,
          cfi: "epubcfi(/6/2)",
          sectionIndex: 1,
        },
      },
    ])
  })

  test("rehydrates persisted skill parts without changing them to agents", async () => {
    const key = getPromptScopeKey("/repo", "session-skill")
    localStorage.setItem(
      PROMPT_STORE_STORAGE_KEY,
      JSON.stringify({
        version: PROMPT_STORE_VERSION,
        state: {
          draftsByKey: {
            [key]: {
              value: "/explain",
              parts: [{ type: "skill", name: "explain" }],
              attachments: [],
              cursor: 8,
              updatedAt: 1,
            },
          },
          historyByDirectory: {},
        },
      }),
    )

    await usePromptStore.persist.rehydrate()

    expect(getPromptDraft(usePromptStore.getState(), key).parts).toEqual([
      { type: "skill", name: "explain" },
    ])
  })

  test("rehydrates canonical PDF selections without flattened location fields", async () => {
    const key = getPromptScopeKey("/repo", "session-pdf")
    const anchor = {
      kind: READER_ANCHOR_KIND_PDF_TEXT,
      segments: [
        {
          pageIndex: 3,
          quads: [
            {
              topLeft: { x: 10, y: 20 },
              topRight: { x: 40, y: 20 },
              bottomRight: { x: 40, y: 32 },
              bottomLeft: { x: 10, y: 32 },
            },
          ],
        },
      ],
      quote: { exact: "PDF selected text" },
    }
    localStorage.setItem(
      PROMPT_STORE_STORAGE_KEY,
      JSON.stringify({
        version: 2,
        state: {
          draftsByKey: {
            [key]: {
              value: '"PDF selected text"',
              parts: [
                {
                  type: "selection-context",
                  source: "reading",
                  text: "PDF selected text",
                  selectionKey: "selection-pdf",
                  anchor,
                },
              ],
              attachments: [],
              cursor: 0,
              updatedAt: 1,
            },
          },
          historyByDirectory: {},
        },
      }),
    )

    await usePromptStore.persist.rehydrate()

    const part = getPromptDraft(usePromptStore.getState(), key).parts[0]
    expect(part).toEqual({
      type: "selection-context",
      source: "reading",
      text: "PDF selected text",
      selectionKey: "selection-pdf",
      anchor,
    })
    expect(part).not.toHaveProperty("cfi")
    expect(part).not.toHaveProperty("index")
  })
})
