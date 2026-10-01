import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { toast } from "@buddy/ui"
import { PromptComposer } from "../src/components/prompt/prompt-composer"
import { createBrowserPlatform, setRuntimePlatform } from "../src/context/platform"
import { setRuntimeServerConnection } from "../src/context/server"
import { withFetchPreconnect, type FetchImplementation } from "../src/lib/fetch-transport"
import { processedResourcesQueryKey } from "../src/state/resources-query"
import {
  createTextPromptDraft,
  flushPromptStorePersistence,
  getPromptScopeKey,
  PROMPT_STORE_STORAGE_KEY,
  usePromptStore,
} from "../src/state/prompt-store"
import {
  createTestQueryClient,
  seedSkillPresentations,
  TestQueryClientProvider,
} from "./query-test-utils"

const TEST_DIRECTORY = "/mention-fixture"
const originalFetch = globalThis.fetch
let queryClient: ReturnType<typeof createTestQueryClient>

function requestURL(input: Parameters<FetchImplementation>[0]) {
  return new URL(input instanceof Request ? input.url : String(input), "http://buddy.test")
}

async function flushEffects(delay = 0) {
  await Promise.resolve()
  await new Promise<void>((resolve) => {
    setTimeout(resolve, delay)
  })
}

function spyOnErrorToast() {
  return spyOn(toast, "error").mockImplementation(() => "test-toast")
}

function composer() {
  return (
    <TestQueryClientProvider queryClient={queryClient}>
      <PromptComposer
        directory={TEST_DIRECTORY}
        isBusy={false}
        personaOptions={[{ name: "buddy", label: "Buddy" }]}
        mentionableAgents={[]}
        mentionableReferences={[]}
        slashCommands={[]}
        modelOptions={[{ key: "openai/gpt-5", label: "GPT-5", acceptsImages: true }]}
        selectedModelAcceptsImages
        selectedPersona="buddy"
        selectedModel="openai/gpt-5"
        thinkingOptions={[{ key: "default", label: "Default" }]}
        selectedThinking="default"
        selectorMode="native"
        onPersonaChange={() => undefined}
        onModelChange={() => undefined}
        onThinkingChange={() => undefined}
        onSubmit={() => undefined}
        onAbort={() => undefined}
        onNewSession={() => undefined}
        sessionContextUsage={<span data-testid="session-context" />}
      />
    </TestQueryClientProvider>
  )
}

function pills(editor: HTMLElement) {
  return Array.from(editor.querySelectorAll<HTMLElement>('[contenteditable="false"][data-type]'))
}

describe("prompt composer file mentions", () => {
  let container: HTMLDivElement
  let root: Root
  let headRequests: string[]
  let headGate: ReturnType<typeof Promise.withResolvers<void>> | undefined
  let indexPaths: string[]
  let missingPaths: Set<string>
  let errorToast: ReturnType<typeof spyOnErrorToast>

  beforeEach(() => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    setRuntimePlatform(createBrowserPlatform())
    setRuntimeServerConnection({ url: "http://buddy.test", isEmbeddedBackend: false })
    usePromptStore.setState({ draftsByKey: {}, historyByDirectory: {}, historyNavigationByKey: {} })
    flushPromptStorePersistence()
    localStorage.removeItem(PROMPT_STORE_STORAGE_KEY)
    queryClient = createTestQueryClient()
    seedSkillPresentations(queryClient, TEST_DIRECTORY)
    queryClient.setQueryData(processedResourcesQueryKey(TEST_DIRECTORY), [])
    headRequests = []
    headGate = undefined
    indexPaths = ["biology/cells.md"]
    missingPaths = new Set()
    errorToast = spyOnErrorToast()
    globalThis.fetch = withFetchPreconnect(async (input, init) => {
      const url = requestURL(input)
      const method = input instanceof Request ? input.method : (init?.method ?? "GET")
      if (url.pathname === "/api/find/notebook-file-index") {
        return Response.json({ paths: indexPaths, partial: false })
      }
      if (url.pathname === "/api/objects/resource") return Response.json({ resources: [] })
      if (url.pathname === "/api/objects") return Response.json({ objects: [] })
      if (method === "HEAD" && url.pathname.startsWith("/api/file/raw/")) {
        const path = url.searchParams.get("path") ?? ""
        headRequests.push(path)
        // Like the server, a directory is never a file and a deleted file is gone.
        if (path.endsWith("/") || missingPaths.has(path)) return new Response(null, { status: 404 })
        await headGate?.promise
        return new Response(null, { status: 200 })
      }
      throw new Error(`Unexpected request: ${method} ${url}`)
    }, originalFetch)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
      await flushEffects()
    })
    queryClient.clear()
    container.remove()
    errorToast.mockRestore()
    globalThis.fetch = originalFetch
    setRuntimeServerConnection({ url: "", isEmbeddedBackend: false })
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", undefined)
  })

  async function openMentionMenu(query = "@bio") {
    usePromptStore
      .getState()
      .replaceDraft(getPromptScopeKey(TEST_DIRECTORY), createTextPromptDraft(query))
    await act(async () => {
      root.render(composer())
      await flushEffects(20)
    })
    const editor = container.querySelector<HTMLElement>('[data-component="prompt-editor"]')
    if (!editor) throw new Error("Expected the prompt editor")
    await act(async () => {
      editor.focus()
      await flushEffects(20)
    })
    // Rows are rendered by the open menu, so no rows means the menu never opened.
    expect(document.querySelector('[data-component="prompt-mention-option"]')).not.toBeNull()
    return editor
  }

  async function press(editor: HTMLElement, key: string) {
    await act(async () => {
      editor.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }))
      await flushEffects()
    })
  }

  test("a folder mention inserts without checking that it is a file", async () => {
    const editor = await openMentionMenu()
    const folder = document.querySelector<HTMLElement>('[data-value="file:biology/"]')
    if (!folder) throw new Error("Expected the biology folder row")

    await act(async () => {
      folder.click()
      await flushEffects()
    })

    expect(headRequests).toEqual([])
    expect(pills(editor).map((pill) => pill.dataset.serialized)).toEqual([
      expect.stringContaining("biology/"),
    ])
  })

  test("a folder matching the typed prefix stays above ten matching files", async () => {
    indexPaths = Array.from(
      { length: 12 },
      (_, index) => `biology/cell-${String(index).padStart(2, "0")}.md`,
    )
    await openMentionMenu("@biology/")
    const rows = Array.from(
      document.querySelectorAll<HTMLElement>('[data-component="prompt-mention-option"]'),
    )

    expect(rows).toHaveLength(10)
    expect(rows[0]?.dataset.value).toBe("file:biology/")
  })

  test("a second Enter while the file check runs inserts one pill", async () => {
    headGate = Promise.withResolvers<void>()
    const editor = await openMentionMenu("@cell")

    await press(editor, "Enter")
    await press(editor, "Enter")
    await act(async () => {
      headGate?.resolve()
      await flushEffects(20)
    })

    expect(headRequests).toEqual(["biology/cells.md"])
    expect(pills(editor)).toHaveLength(1)
  })

  test("Escape while the file check runs inserts nothing", async () => {
    headGate = Promise.withResolvers<void>()
    const editor = await openMentionMenu("@cell")

    await press(editor, "Enter")
    await press(editor, "Escape")
    await act(async () => {
      headGate?.resolve()
      await flushEffects(20)
    })

    expect(headRequests).toEqual(["biology/cells.md"])
    expect(pills(editor)).toHaveLength(0)
    expect(editor.textContent).toBe("@cell")
  })

  test("leaving the editor while the file check runs inserts nothing", async () => {
    headGate = Promise.withResolvers<void>()
    const editor = await openMentionMenu("@cell")

    await press(editor, "Enter")
    await act(async () => {
      editor.blur()
      await flushEffects()
    })
    await act(async () => {
      headGate?.resolve()
      await flushEffects(20)
    })

    expect(headRequests).toEqual(["biology/cells.md"])
    expect(pills(editor)).toHaveLength(0)
    expect(document.activeElement).not.toBe(editor)
  })

  test("returning to the editor does not revive a pick abandoned by leaving it", async () => {
    headGate = Promise.withResolvers<void>()
    const editor = await openMentionMenu("@cell")

    await press(editor, "Enter")
    await act(async () => {
      editor.blur()
      await flushEffects()
    })
    await act(async () => {
      editor.focus()
      await flushEffects(20)
    })
    await act(async () => {
      headGate?.resolve()
      await flushEffects(20)
    })

    expect(headRequests).toEqual(["biology/cells.md"])
    expect(pills(editor)).toHaveLength(0)
    expect(editor.textContent).toBe("@cell")
  })

  test("a deleted unprocessed PDF is not inserted", async () => {
    indexPaths = ["biology/cells.pdf"]
    missingPaths.add("biology/cells.pdf")
    const editor = await openMentionMenu()
    const row = document.querySelector<HTMLElement>('[data-value="source-file:biology/cells.pdf"]')
    if (!row) throw new Error("Expected the PDF row")

    await act(async () => {
      row.click()
      await flushEffects(20)
    })

    expect(headRequests).toEqual(["biology/cells.pdf"])
    expect(errorToast).toHaveBeenCalledWith("cells.pdf was moved or deleted.")
    expect(pills(editor)).toHaveLength(0)
    expect(editor.textContent).toBe("@bio")
  })

  test("an existing unprocessed PDF inserts after the file check", async () => {
    indexPaths = ["biology/cells.pdf"]
    const editor = await openMentionMenu()
    const row = document.querySelector<HTMLElement>('[data-value="source-file:biology/cells.pdf"]')
    if (!row) throw new Error("Expected the PDF row")

    await act(async () => {
      row.click()
      await flushEffects(20)
    })

    expect(headRequests).toEqual(["biology/cells.pdf"])
    expect(errorToast).not.toHaveBeenCalled()
    expect(pills(editor).map((pill) => pill.dataset.serialized)).toEqual([
      expect.stringContaining("biology/cells.pdf"),
    ])
  })
})
